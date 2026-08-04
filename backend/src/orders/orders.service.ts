import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import type { AuditActor, CheckoutPayload, OrderResponse } from '@contracts';
import { AuditService } from '@/audit/audit.service';
import { Product } from '@/catalog/product.schema';
import { toMinor } from '@/common/money';
import { clampPagination, paginate } from '@/common/pagination';
import { CountersService } from '@/database/counters.service';
import { CouponsService } from '@/coupons/coupons.service';
import { CustomersService } from '@/customers/customers.service';
import { InsufficientStockError, InventoryService } from '@/inventory/inventory.service';
import { QUEUES } from '@/jobs/queues';
import { LoyaltyLedgerService } from '@/loyalty/loyalty-ledger.service';
import { LoyaltyRulesService } from '@/loyalty/loyalty-rules.service';
import { LoyaltyService } from '@/loyalty/loyalty.service';
import { SettingsService } from '@/settings/settings.service';
import { priceExplicitBundle } from '@/catalog/product-pricing';
import { CheckoutDto } from './dto/checkout.dto';
import { OrderListQueryDto } from './dto/order-list-query.dto';
import { UpdateOrderDto } from './dto/order-update.dto';
import { computeOrderTotals, computeStockDeltas } from './order-calc';
import { toOrderContract } from './order.mapper';
import { DEFAULT_STATUS, DRAFT_STATUS, planStockTransition, stockEffectForStatus } from './order-status';
import { Order, OrderDocument } from './order.schema';

const ORDER_NUMBER_SEQUENCE = 'orderNumber';
const SYSTEM_ACTOR: AuditActor = { type: 'system', id: null, name: 'checkout' };

type ResolvedLine = {
  productId: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  qty: number;
  unitPriceMinor: number;
  totalMinor: number;
  variation: Record<string, string> | null;
  bundleName: string | null;
  bundleSlot: number | null;
  costMinor: number;
  categoryIds: string[];
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name) private readonly model: Model<Order>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectConnection() private readonly connection: Connection,
    private readonly counters: CountersService,
    private readonly inventory: InventoryService,
    private readonly coupons: CouponsService,
    private readonly customers: CustomersService,
    private readonly settings: SettingsService,
    private readonly loyalty: LoyaltyService,
    private readonly loyaltyRules: LoyaltyRulesService,
    private readonly loyaltyLedger: LoyaltyLedgerService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    @InjectQueue(QUEUES.CARRIER_PUSH) private readonly carrierPushQueue: Queue,
  ) {}

  async create(dto: CheckoutDto, idempotencyKey: string | undefined): Promise<OrderResponse> {
    if (idempotencyKey) {
      const existing = await this.model.findOne({ idempotencyKey });
      if (existing) return toOrderContract(existing);
    }
    if (dto.items.length === 0) throw new BadRequestException('Panier vide.');
    if (!dto.customer?.phone || !dto.customer?.firstName) {
      throw new BadRequestException('Nom et téléphone obligatoires.');
    }

    const commerce = await this.settings.getCommerce();
    const status = dto.status === DRAFT_STATUS ? DRAFT_STATUS : (dto.status || commerce.defaultOrderStatus);
    const strict = this.config.get<boolean>('STRICT_STOCK') ?? false;

    const lines = await this.resolveLines(dto);
    const shippingMinor = status === DRAFT_STATUS ? toMinor(dto.shipping ?? 0) : toMinor(commerce.shippingFlat);

    const orderId = new Types.ObjectId();
    const session = await this.connection.startSession();
    try {
      let saved!: OrderDocument;
      await session.withTransaction(async () => {
        let discountMinor = 0;
        let couponSnapshot: Order['coupon'] = null;
        if (dto.couponCode) {
          const eligibleSubtotal = this.eligibleSubtotalForCoupon(lines, null);
          const applied = await this.coupons.applyWithinTxn(
            dto.couponCode,
            eligibleSubtotal,
            dto.customer.phone,
            orderId.toString(),
            session,
          );
          discountMinor = applied.discountMinor;
          couponSnapshot = {
            couponId: applied.couponId,
            code: applied.code,
            type: applied.type,
            value: applied.value,
            discountMinor: applied.discountMinor,
          };
        }

        const totals = computeOrderTotals(
          lines.map((l) => ({ unitPriceMinor: l.unitPriceMinor, qty: l.qty })),
          shippingMinor,
          discountMinor,
        );
        this.logTotalMismatch(dto, totals.totalMinor);

        const orderNumber = await this.counters.next(ORDER_NUMBER_SEQUENCE, session);
        const now = new Date();

        // No stock effect on creation for the normal 'en-attente' path —
        // this store confirms COD orders by phone before stock ever moves
        // (see order-status.ts). Only a rare direct-to-confirmed creation
        // (e.g. an admin backdating an already-confirmed sale) commits here.
        if (stockEffectForStatus(status) === 'commit') {
          for (const line of lines) {
            try {
              await this.inventory.commit(line.productId, line.qty, orderId.toString(), SYSTEM_ACTOR, session, strict);
            } catch (err) {
              if (err instanceof InsufficientStockError) {
                throw new BadRequestException(`Stock insuffisant pour ${line.name}`);
              }
              throw err;
            }
          }
        }

        const customerDoc = await this.customers.upsertFromOrder(dto.customer, totals.totalMinor, now, session);

        const [created] = await this.model.create(
          [
            {
              _id: orderId,
              orderNumber,
              status,
              statusHistory: [{ from: null, to: status, by: SYSTEM_ACTOR, at: now, note: null }],
              customer: {
                firstName: dto.customer.firstName,
                lastName: dto.customer.lastName ?? '',
                phone: dto.customer.phone,
                phone2: dto.customer.phone2 ?? '',
                email: dto.customer.email ?? '',
                city: dto.customer.city,
                address: dto.customer.address,
                note: dto.customer.note ?? '',
              },
              customerId: customerDoc?.id ?? null,
              items: lines.map((l) => ({
                productId: l.productId,
                legacyProductId: null,
                name: l.name,
                slug: l.slug,
                imageUrl: l.imageUrl,
                qty: l.qty,
                unitPriceMinor: l.unitPriceMinor,
                totalMinor: l.totalMinor,
                variation: l.variation,
                bundleName: l.bundleName,
                bundleSlot: l.bundleSlot,
                costMinor: l.costMinor,
              })),
              subtotalMinor: totals.subtotalMinor,
              shippingMinor: totals.shippingMinor,
              discountMinor: totals.discountMinor,
              totalMinor: totals.totalMinor,
              manualSubtotalMinor: dto.subtotal != null ? toMinor(dto.subtotal) : null,
              manualTotalMinor: dto.total != null ? toMinor(dto.total) : null,
              coupon: couponSnapshot,
              deliveryCompany: dto.deliveryCompany ?? '',
              paymentMethod: dto.paymentMethod ?? 'cod',
              source: dto.source ?? '',
              attempts: dto.attempts ?? 0,
              idempotencyKey: idempotencyKey ?? undefined,
            },
          ],
          { session },
        );
        saved = created;
      });

      // Carrier auto-push is best-effort and runs after the transaction
      // commits — a failure here must never roll back or fail the order
      // (matches the legacy try/catch-and-swallow behavior).
      if (saved.status !== DRAFT_STATUS) await this.maybeEnqueueAutoPush(saved);
      return toOrderContract(await this.model.findById(saved._id) as OrderDocument);
    } finally {
      await session.endSession();
    }
  }

  /** Matches app/api/orders/route.ts's `{orderId}` upsert semantics for checkout drafts. */
  async updateDraft(id: string, dto: CheckoutDto): Promise<OrderResponse> {
    const doc = await this.findDoc(id);
    const lines = await this.resolveLines(dto);
    const commerce = await this.settings.getCommerce();
    const nextStatus = dto.status || doc.status;
    const shippingMinor = nextStatus === DRAFT_STATUS ? toMinor(dto.shipping ?? 0) : toMinor(commerce.shippingFlat);
    const totals = computeOrderTotals(
      lines.map((l) => ({ unitPriceMinor: l.unitPriceMinor, qty: l.qty })),
      shippingMinor,
      0,
    );

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        // Update customer + line items BEFORE the status transition so that
        // a draft->reserving transition reserves against the current cart,
        // not whatever items the draft happened to hold previously.
        doc.customer = {
          firstName: dto.customer.firstName,
          lastName: dto.customer.lastName ?? '',
          phone: dto.customer.phone,
          phone2: dto.customer.phone2 ?? '',
          email: dto.customer.email ?? '',
          city: dto.customer.city,
          address: dto.customer.address,
          note: dto.customer.note ?? '',
        } as Order['customer'];
        doc.items = lines.map((l) => ({
          productId: l.productId,
          legacyProductId: null,
          name: l.name,
          slug: l.slug,
          imageUrl: l.imageUrl,
          qty: l.qty,
          unitPriceMinor: l.unitPriceMinor,
          totalMinor: l.totalMinor,
          variation: l.variation,
          bundleName: l.bundleName,
          bundleSlot: l.bundleSlot,
          costMinor: l.costMinor,
        })) as Order['items'];
        doc.subtotalMinor = totals.subtotalMinor;
        doc.shippingMinor = totals.shippingMinor;
        doc.totalMinor = totals.totalMinor;
        if (dto.subtotal != null) doc.manualSubtotalMinor = toMinor(dto.subtotal);
        if (dto.total != null) doc.manualTotalMinor = toMinor(dto.total);
        if (dto.attempts != null) doc.attempts = dto.attempts;
        await this.applyStatusTransition(doc, nextStatus, SYSTEM_ACTOR, null, session);
        await doc.save({ session });
        await this.customers.upsertFromOrder(dto.customer, totals.totalMinor, new Date(), session);
      });
      if (doc.status !== DRAFT_STATUS) {
        await this.maybeEnqueueAutoPush(doc);
      }
      return toOrderContract(await this.model.findById(doc._id) as OrderDocument);
    } finally {
      await session.endSession();
    }
  }

  async getById(id: string): Promise<OrderResponse | null> {
    const doc = await this.model.findById(id).catch(() => null);
    return doc ? toOrderContract(doc) : null;
  }

  async list(query: OrderListQueryDto) {
    const { page, perPage, skip } = clampPagination(query.page, query.perPage, 100);
    const filter: Record<string, unknown> = {};
    if (query.status && query.status !== 'any') {
      const statuses = query.status.split(',').map((status) => status.trim()).filter(Boolean);
      filter.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
    }
    if (query.search) {
      filter.$or = [
        { 'customer.firstName': { $regex: query.search, $options: 'i' } },
        { 'customer.phone': { $regex: query.search, $options: 'i' } },
        { orderNumber: Number.isNaN(Number(query.search)) ? -1 : Number(query.search) },
      ];
    }
    if (query.after || query.before) {
      filter.createdAt = {
        ...(query.after ? { $gte: new Date(query.after) } : {}),
        ...(query.before ? { $lte: new Date(query.before) } : {}),
      };
    }

    const [docs, total] = await Promise.all([
      this.model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(perPage),
      this.model.countDocuments(filter),
    ]);
    return paginate(docs.map((d) => toOrderContract(d)), total, page, perPage);
  }

  async ordersByPhone(phone: string) {
    const docs = await this.model.find({ 'customer.phone': phone }).sort({ createdAt: -1 }).limit(20);
    return docs.map((d) => toOrderContract(d));
  }

  /**
   * Admin/employee order edits. Totals are ALWAYS recomputed server-side
   * from the resolved items (computeOrderTotals) — patch.subtotal/patch.total
   * only ever feed the separate manualSubtotalMinor/manualTotalMinor
   * override fields (an explicit, clearly-labeled admin override the mapper
   * already prefers when present), never the real computed totals. This is
   * also where item-quantity edits actually take effect — previously
   * `patch.items` was accepted by the DTO but silently dropped.
   */
  async update(id: string, patch: UpdateOrderDto, actor: AuditActor): Promise<OrderResponse> {
    const doc = await this.findDoc(id);

    // A "sensitive" order already had stock physically committed — editing
    // its items/shipping/status without a reason is exactly the "silent
    // editing of a confirmed order" the business rules forbid.
    const wasCommitted = stockEffectForStatus(doc.status) === 'commit';
    const touchesSensitiveFields = patch.items !== undefined || patch.shipping !== undefined || (patch.status !== undefined && patch.status !== doc.status);
    if (wasCommitted && touchesSensitiveFields && !patch.reason?.trim()) {
      throw new BadRequestException('Un motif est requis pour modifier une commande déjà confirmée.');
    }

    const before = {
      status: doc.status,
      items: doc.items.map((i) => ({ productId: i.productId, qty: i.qty, unitPriceMinor: i.unitPriceMinor })),
      subtotalMinor: doc.subtotalMinor,
      shippingMinor: doc.shippingMinor,
      totalMinor: doc.totalMinor,
    };

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        if (patch.customer) Object.assign(doc.customer, patch.customer);
        if (patch.deliveryCompany !== undefined) doc.deliveryCompany = patch.deliveryCompany;
        if (patch.exchange !== undefined) doc.exchange = patch.exchange;
        if (patch.privateNote !== undefined) doc.privateNote = patch.privateNote;
        if (patch.subtotal !== undefined) doc.manualSubtotalMinor = toMinor(patch.subtotal);
        if (patch.total !== undefined) doc.manualTotalMinor = toMinor(patch.total);
        if (patch.attempts !== undefined) doc.attempts = patch.attempts;

        let itemsOrShippingChanged = false;

        if (patch.items) {
          const beforeItems = doc.items.map((i) => ({ productId: i.productId, qty: i.qty }));
          const resolved = await this.resolveUpdateItems(patch.items);

          // Stock was already deducted for this order (wasCommitted) — move
          // only the per-product DELTA, never re-deduct/re-restore the whole
          // line. Must run before any status transition below, so a restock
          // triggered by the same request reverses the correct (post-edit)
          // quantities — see the class-level note on this method.
          if (wasCommitted) {
            const deltas = computeStockDeltas(beforeItems, resolved);
            const strict = this.config.get<boolean>('STRICT_STOCK') ?? false;
            for (const [productId, delta] of deltas) {
              if (delta > 0) {
                try {
                  await this.inventory.commit(productId, delta, id, actor, session, strict);
                } catch (err) {
                  if (err instanceof InsufficientStockError) {
                    throw new BadRequestException('Stock insuffisant pour augmenter la quantité de cet article');
                  }
                  throw err;
                }
              } else {
                await this.inventory.adjust(productId, -delta, `Modification de commande #${doc.orderNumber}`, actor, session);
              }
            }
          }

          doc.items = resolved as unknown as Order['items'];
          itemsOrShippingChanged = true;
        }

        if (patch.shipping !== undefined) {
          doc.shippingMinor = toMinor(patch.shipping);
          itemsOrShippingChanged = true;
        }

        if (itemsOrShippingChanged) {
          const totals = computeOrderTotals(
            doc.items.map((i) => ({ unitPriceMinor: i.unitPriceMinor, qty: i.qty })),
            doc.shippingMinor,
            doc.discountMinor,
          );
          doc.subtotalMinor = totals.subtotalMinor;
          doc.totalMinor = totals.totalMinor;
        }

        if (patch.status && patch.status !== doc.status) {
          await this.applyStatusTransition(doc, patch.status, actor, patch.reason ?? null, session);
        }
        await doc.save({ session });
      });

      await this.audit.log({
        actor,
        action: 'order.update',
        entityType: 'order',
        entityId: id,
        summary: patch.reason ? `Commande modifiée — ${patch.reason}` : 'Commande modifiée',
        before,
        after: {
          status: doc.status,
          items: doc.items.map((i) => ({ productId: i.productId, qty: i.qty, unitPriceMinor: i.unitPriceMinor })),
          subtotalMinor: doc.subtotalMinor,
          shippingMinor: doc.shippingMinor,
          totalMinor: doc.totalMinor,
        },
        ip: null,
      });

      if (doc.status !== DRAFT_STATUS) await this.maybeEnqueueAutoPush(doc);
      return toOrderContract(await this.model.findById(id) as OrderDocument);
    } finally {
      await session.endSession();
    }
  }

  /** Resolves admin-edited order lines against the current catalog —
   *  same field shape as resolveLines() but driven by OrderUpdateItemDto
   *  (productId/qty/unitPrice override/variation), used only from update(). */
  private async resolveUpdateItems(items: { productId: string; qty: number; unitPrice?: number; variation?: Record<string, string>; bundleName?: string; bundleSlot?: number }[]): Promise<ResolvedLine[]> {
    if (items.some((i) => i.qty <= 0)) throw new BadRequestException('La quantité doit être supérieure à zéro');
    const productIds = [...new Set(items.map((i) => i.productId))];
    const productDocs = await this.products.find({ _id: { $in: productIds } });
    const byId = new Map(productDocs.map((p) => [p.id, p]));

    return items.map((item) => {
      const product = byId.get(item.productId);
      if (!product) throw new BadRequestException(`Produit introuvable: ${item.productId}`);
      const unitPriceMinor = item.unitPrice != null ? toMinor(item.unitPrice) : (product.salePriceMinor ?? product.regularPriceMinor);
      return {
        productId: product.id,
        name: product.name,
        slug: product.slug,
        imageUrl: product.images[0]?.url ?? null,
        qty: item.qty,
        unitPriceMinor,
        totalMinor: unitPriceMinor * item.qty,
        variation: item.variation ?? null,
        bundleName: item.bundleName ?? null,
        bundleSlot: item.bundleSlot ?? null,
        costMinor: product.costMinor ?? 0,
        categoryIds: product.categoryIds ?? [],
      };
    });
  }

  async changeStatus(id: string, status: string, actor: AuditActor): Promise<OrderResponse> {
    const doc = await this.findDoc(id);
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await this.applyStatusTransition(doc, status, actor, null, session);
        await doc.save({ session });
      });
      if (doc.status !== DRAFT_STATUS) await this.maybeEnqueueAutoPush(doc);
      return toOrderContract(await this.model.findById(id) as OrderDocument);
    } finally {
      await session.endSession();
    }
  }

  async remove(id: string): Promise<void> {
    const doc = await this.findDoc(id);
    if (doc.status === 'trash') {
      await doc.deleteOne();
      return;
    }
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await this.applyStatusTransition(doc, 'trash', { type: 'system', id: null, name: 'delete' }, 'Mise à la corbeille', session);
        await doc.save({ session });
      });
    } finally {
      await session.endSession();
    }
  }

  async distinctStatuses(): Promise<string[]> {
    const used = await this.model.distinct('status');
    const standard = ['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed'];
    return Array.from(new Set([...used, ...standard]));
  }

  private async findDoc(id: string): Promise<OrderDocument> {
    const doc = await this.model.findById(id).catch(() => null);
    if (!doc) throw new NotFoundException('Commande introuvable');
    return doc;
  }

  private async resolveLines(dto: CheckoutDto): Promise<ResolvedLine[]> {
    const productIds = [...new Set(dto.items.map((i) => i.productId))];
    const products = await this.products.find({ _id: { $in: productIds } });
    const byId = new Map(products.map((p) => [p.id, p]));

    return dto.items.map((item) => {
      const product = byId.get(item.productId);
      if (!product) throw new BadRequestException(`Produit introuvable: ${item.productId}`);
      if (product.posOnly) throw new BadRequestException(`Produit non disponible à la vente en ligne: ${product.name}`);

      let unitPriceMinor: number;
      const bundle = item.bundleId ? product.bundles.find((b) => b.id === item.bundleId) : undefined;
      if (bundle) {
        unitPriceMinor = Math.round(priceExplicitBundle(bundle).totalMinor / Math.max(1, bundle.quantity));
      } else {
        unitPriceMinor = product.salePriceMinor ?? product.regularPriceMinor;
      }

      return {
        productId: product.id,
        name: product.name,
        slug: product.slug,
        imageUrl: product.images[0]?.url ?? null,
        qty: item.qty,
        unitPriceMinor,
        totalMinor: unitPriceMinor * item.qty,
        variation: item.variation ?? null,
        bundleName: item.bundleName ?? null,
        bundleSlot: item.bundleSlot ?? null,
        costMinor: product.costMinor ?? 0,
        categoryIds: product.categoryIds ?? [],
      };
    });
  }

  private eligibleSubtotalForCoupon(lines: ResolvedLine[], _appliesTo: null): number {
    // appliesTo restriction beyond "all" is configurable in the admin CRUD
    // for future use; the live checkout path currently applies against the
    // full cart subtotal (documented scope decision for TASK-03).
    return lines.reduce((sum, l) => sum + l.totalMinor, 0);
  }

  private logTotalMismatch(dto: CheckoutDto, serverTotalMinor: number): void {
    if (dto.total === undefined) return;
    const clientMinor = toMinor(dto.total);
    if (Math.abs(clientMinor - serverTotalMinor) > 1) {
      this.logger.warn(`Client total mismatch: client=${clientMinor} server=${serverTotalMinor}`);
    }
  }

  private async applyStatusTransition(
    doc: OrderDocument,
    nextStatus: string,
    actor: AuditActor,
    note: string | null,
    session: ClientSession,
  ): Promise<void> {
    const from = doc.status;
    if (from === nextStatus) return;
    // 'trash' is a bin, not a cancellation — leave whatever stock state the
    // order was already in untouched (moving to/from trash never reserves,
    // commits, or releases anything).
    const isTrashTransition = from === 'trash' || nextStatus === 'trash';
    const fromEffect = stockEffectForStatus(from);
    const toEffect = stockEffectForStatus(nextStatus);
    const action = isTrashTransition ? 'none' : planStockTransition(fromEffect, toEffect);
    const strict = this.config.get<boolean>('STRICT_STOCK') ?? false;

    for (const item of doc.items) {
      if (action === 'reserve') {
        await this.inventory.reserve(item.productId, item.qty, doc.id, actor, false, session);
      } else if (action === 'commit') {
        // The normal path: 'en-attente' (fromEffect 'none') → 'confirme'.
        // Nothing was reserved earlier, so this single commit() call is
        // both the availability check (in strict mode) and the deduction.
        try {
          await this.inventory.commit(item.productId, item.qty, doc.id, actor, session, strict);
        } catch (err) {
          if (err instanceof InsufficientStockError) {
            throw new BadRequestException(`Stock insuffisant pour ${item.name}`);
          }
          throw err;
        }
      } else if (action === 'release') {
        await this.inventory.release(item.productId, item.qty, doc.id, actor, session);
      } else if (action === 'restock') {
        await this.inventory.adjust(item.productId, item.qty, `Annulation commande #${doc.orderNumber}`, actor, session);
      }
    }

    if (!isTrashTransition && toEffect === 'release' && doc.coupon) {
      await this.coupons.releaseRedemption(doc.coupon.couponId, doc.id, session);
    }

    await this.maybeEarnLoyaltyPoints(doc, from, nextStatus, session);

    doc.status = nextStatus;
    doc.statusHistory.push({ from, to: nextStatus, by: actor, at: new Date(), note } as Order['statusHistory'][number]);
    await this.audit.log({
      actor,
      action: 'order.status_change',
      entityType: 'order',
      entityId: doc.id,
      summary: `Statut changé de "${from}" à "${nextStatus}"`,
      before: { status: from },
      after: { status: nextStatus },
      ip: null,
    });
  }

  /**
   * Online earning hook — same transition point stockEffectForStatus runs
   * at, gated by settings.loyalty.earnOnOrderStatus. Only for customers
   * with an existing ACTIVE loyalty account (opt-in, never auto-created).
   */
  private async maybeEarnLoyaltyPoints(doc: OrderDocument, from: string, nextStatus: string, session: ClientSession): Promise<void> {
    if (!doc.customerId || from === nextStatus) return;
    const rules = await this.settings.getLoyaltySettings();
    if (nextStatus !== rules.earnOnOrderStatus || from === rules.earnOnOrderStatus) return;
    const account = await this.loyalty.getByCustomerId(doc.customerId);
    if (!account || account.status !== 'ACTIVE') return;

    const productIds = [...new Set(doc.items.map((i) => i.productId))];
    const productDocs = productIds.length ? await this.products.find({ _id: { $in: productIds } }).select({ categoryIds: 1 }) : [];
    const categoryIdsByProductId = new Map(productDocs.map((p) => [p.id, p.categoryIds ?? []]));

    const points = this.loyaltyRules.calculateEarnedPointsWithRules(
      {
        lines: doc.items.map((i) => ({
          productId: i.productId,
          categoryIds: categoryIdsByProductId.get(i.productId) ?? [],
          totalMinor: i.totalMinor,
        })),
        shippingMinor: doc.shippingMinor,
      },
      rules,
    );
    if (points <= 0) return;

    await this.loyaltyLedger.apply({
      accountId: account.id,
      type: 'EARN',
      pointsDelta: points,
      sourceType: 'ONLINE_ORDER',
      sourceId: doc.id,
      session,
    });
  }

  /**
   * Enqueue a carrier auto-push job when the order's delivery company
   * matches the configured label (ported from woo-order-service.ts's
   * NAVEX_AUTO_PUSH_LABEL/FIRST_DELIVERY_AUTO_PUSH_LABEL check). Axess has
   * no auto-push label in the legacy env — manual push only, same here.
   * Never pushes twice: the worker-side ShippingService is itself
   * idempotent per order+carrier, this is just an optimization to avoid
   * queuing pointless jobs.
   */
  private async maybeEnqueueAutoPush(doc: OrderDocument): Promise<void> {
    const carrier = (doc.deliveryCompany ?? '').toLowerCase();
    if (!carrier) return;
    const navexLabel = (this.config.get<string>('NAVEX_AUTO_PUSH_LABEL') ?? 'navex').toLowerCase();
    const fdLabel = (this.config.get<string>('FIRST_DELIVERY_AUTO_PUSH_LABEL') ?? 'firstdelivery').toLowerCase();
    try {
      if (carrier.includes(navexLabel) && !doc.carrier.navex) {
        await this.carrierPushQueue.add('push', { carrier: 'navex', orderId: doc.id });
      } else if (carrier.includes(fdLabel) && !doc.carrier.firstdelivery) {
        await this.carrierPushQueue.add('push', { carrier: 'firstdelivery', orderId: doc.id });
      }
    } catch (err) {
      this.logger.warn(`Failed to enqueue carrier auto-push for order ${doc.id}: ${String(err)}`);
    }
  }
}

/** Kept for callers that still import the WooCommerce-era payload shape name. */
export type { CheckoutPayload };
export { DEFAULT_STATUS };
