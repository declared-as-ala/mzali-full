import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import type { AuditActor, CheckoutPayload, OrderResponse, OrderStatusCounts } from '@contracts';
import { AuditService } from '@/audit/audit.service';
import { Product } from '@/catalog/product.schema';
import { primaryProductImage } from '@/catalog/product-media';
import { toMinor } from '@/common/money';
import { clampPagination, paginate } from '@/common/pagination';
import { normalizePublicMediaUrl } from '@/common/public-media-url';
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
import { diffCustomer, diffItems, hasItemChanges, ItemSnapshot, OrderSnapshot, snapshotCustomer, snapshotItems } from './order-diff';
import { toOrderContract } from './order.mapper';
import { DEFAULT_STATUS, DRAFT_STATUS, getAttemptNumber, planStockTransition, stockEffectForStatus } from './order-status';
import { Order, OrderDocument } from './order.schema';

const ORDER_NUMBER_SEQUENCE = 'orderNumber';
const SYSTEM_ACTOR: AuditActor = { type: 'system', id: null, name: 'checkout' };

type ResolvedLine = {
  productId: string;
  variantId?: string | null;
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
    if (!dto.customer?.phone) {
      throw new BadRequestException('Numéro de téléphone obligatoire.');
    }

    const commerce = await this.settings.getCommerce();
    const status = dto.status === DRAFT_STATUS ? DRAFT_STATUS : (dto.status || commerce.defaultOrderStatus);
    const strict = true;

    const lines = await this.resolveLines(dto);
    if ((await this.settings.getInventorySettings()).enabled !== false && dto.status !== DRAFT_STATUS) {
      const quantities = new Map<string, { productId: string; qty: number }>();
      for (const l of lines) quantities.set(l.variantId!, { productId: l.productId, qty: (quantities.get(l.variantId!)?.qty ?? 0) + l.qty });
      for (const [id, l] of quantities) await this.inventory.validateAvailable(l.productId, id, l.qty);
    }
    const inventoryEnabled = (await this.settings.getInventorySettings()).enabled !== false;
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
        if (inventoryEnabled && stockEffectForStatus(status) === 'commit') {
          for (const line of lines) {
            try {
              await this.inventory.commit(line.productId, line.qty, orderId.toString(), SYSTEM_ACTOR, session, strict, line.variantId);
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
              stockCommitted: inventoryEnabled && stockEffectForStatus(status) === 'commit',
              statusHistory: [{ from: null, to: status, by: SYSTEM_ACTOR, at: now, note: null }],
              customer: {
                firstName: dto.customer.firstName ?? '',
                lastName: dto.customer.lastName ?? '',
                phone: dto.customer.phone,
                phone2: dto.customer.phone2 ?? '',
                email: dto.customer.email ?? '',
                city: dto.customer.city ?? '',
                address: dto.customer.address ?? '',
                note: dto.customer.note ?? '',
              },
              customerId: customerDoc?.id ?? null,
              items: lines.map((l) => ({
                productId: l.productId,
                variantId: l.variantId,
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
              attempts: getAttemptNumber(status) ?? dto.attempts ?? 0,
              confirmedAt: (status === 'confirme' || stockEffectForStatus(status) === 'commit') ? now : null,
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
    } catch (error) {
      if (idempotencyKey && (error as { code?: number }).code === 11000) {
        const existing = await this.model.findOne({ idempotencyKey });
        if (existing) return toOrderContract(existing);
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /** Matches app/api/orders/route.ts's `{orderId}` upsert semantics for checkout drafts. */
  async updateDraft(id: string, dto: CheckoutDto): Promise<OrderResponse> {
    let doc = await this.findDoc(id);
    const nextStatus = dto.status || doc.status;

    // Idempotency / race guard: if already finalized into a real order and caller tries to confirm again, return safely
    if (doc.status !== DRAFT_STATUS && nextStatus !== DRAFT_STATUS) {
      return toOrderContract(doc);
    }

    const lines = await this.resolveLines(dto);
    if ((await this.settings.getInventorySettings()).enabled !== false && dto.status !== DRAFT_STATUS) {
      const quantities = new Map<string, { productId: string; qty: number }>();
      for (const l of lines) quantities.set(l.variantId!, { productId: l.productId, qty: (quantities.get(l.variantId!)?.qty ?? 0) + l.qty });
      for (const [id, l] of quantities) await this.inventory.validateAvailable(l.productId, id, l.qty);
    }
    const commerce = await this.settings.getCommerce();
    const shippingMinor = nextStatus === DRAFT_STATUS ? toMinor(dto.shipping ?? 0) : toMinor(commerce.shippingFlat);

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        doc = await this.model.findById(id).session(session) as OrderDocument;
        if (!doc) throw new NotFoundException('Commande introuvable');
        if (doc.status !== DRAFT_STATUS) return;
        await this.model.updateOne({ _id: id }, { $inc: { version: 1 } }, { session });
        doc.version = (doc.version ?? 0) + 1;
        let discountMinor = 0;
        let couponSnapshot: Order['coupon'] = doc.coupon ?? null;
        if (dto.couponCode && nextStatus !== DRAFT_STATUS) {
          const eligibleSubtotal = this.eligibleSubtotalForCoupon(lines, null);
          const applied = await this.coupons.applyWithinTxn(
            dto.couponCode,
            eligibleSubtotal,
            dto.customer.phone,
            doc._id.toString(),
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
        } else if (doc.coupon && doc.coupon.discountMinor > 0) {
          discountMinor = doc.coupon.discountMinor;
        }

        const totals = computeOrderTotals(
          lines.map((l) => ({ unitPriceMinor: l.unitPriceMinor, qty: l.qty })),
          shippingMinor,
          discountMinor,
        );

        // Update customer + line items BEFORE the status transition so that
        // a draft->reserving transition reserves against the current cart,
        // not whatever items the draft happened to hold previously.
        doc.customer = {
          firstName: dto.customer.firstName ?? '',
          lastName: dto.customer.lastName ?? '',
          phone: dto.customer.phone,
          phone2: dto.customer.phone2 ?? '',
          email: dto.customer.email ?? '',
          city: dto.customer.city ?? '',
          address: dto.customer.address ?? '',
          note: dto.customer.note ?? '',
        } as Order['customer'];
        doc.items = lines.map((l) => ({
          productId: l.productId,
          variantId: l.variantId,
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
        doc.discountMinor = totals.discountMinor;
        doc.totalMinor = totals.totalMinor;
        doc.coupon = couponSnapshot;
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
    // Default page size is 100. clampPagination's built-in default is 20;
    // explicitly supply 100 so omitting perPage in the query also gives 100.
    const { page, perPage, skip } = clampPagination(query.page, query.perPage ?? 100, 100);
    const andConditions: Record<string, unknown>[] = [];

    let isConfirmedOnly = false;
    if (query.status && query.status !== 'any') {
      const statuses = query.status.split(',').map((status) => status.trim()).filter(Boolean);
      andConditions.push({ status: statuses.length > 1 ? { $in: statuses } : statuses[0] });
      if (statuses.length === 1 && statuses[0] === 'confirme') {
        isConfirmedOnly = true;
      }
    }

    if (query.search) {
      andConditions.push({
        $or: [
          { 'customer.firstName': { $regex: query.search, $options: 'i' } },
          { 'customer.phone': { $regex: query.search, $options: 'i' } },
          { orderNumber: Number.isNaN(Number(query.search)) ? -1 : Number(query.search) },
        ],
      });
    }

    // Product filter — matches any order whose line items contain this product.
    // Filtered at the DB level so count() and pagination are correct. Uses the
    // stable productId reference (not the name snapshot) for historical accuracy.
    if (query.productId) {
      andConditions.push({ 'items.productId': query.productId });
    }

    if (query.after || query.before) {
      const dateRange = {
        ...(query.after ? { $gte: new Date(query.after) } : {}),
        ...(query.before ? { $lte: new Date(query.before) } : {}),
      };
      if (isConfirmedOnly) {
        andConditions.push({
          $or: [
            { confirmedAt: dateRange },
            { confirmedAt: null, createdAt: dateRange },
          ],
        });
      } else {
        andConditions.push({ createdAt: dateRange });
      }
    }

    const filter = andConditions.length > 0 ? { $and: andConditions } : {};

    const sortDir = query.sortOrder === 'asc' ? 1 : -1;
    const sortObj = isConfirmedOnly
      ? { confirmedAt: sortDir, createdAt: sortDir }
      : { createdAt: sortDir };

    const [docs, total] = await Promise.all([
      this.model.find(filter).sort(sortObj as unknown as Record<string, 1 | -1>).skip(skip).limit(perPage),
      this.model.countDocuments(filter),
    ]);

    for (const doc of docs) {
      if (doc.status === 'confirme' && !doc.confirmedAt && doc.statusHistory?.length) {
        const confirmedEntry = [...doc.statusHistory].reverse().find((e) => e.to === 'confirme' || e.to === 'completed');
        if (confirmedEntry?.at) {
          doc.confirmedAt = new Date(confirmedEntry.at);
          void doc.save().catch(() => {});
        }
      }
    }

    return paginate(docs.map((d) => toOrderContract(d)), total, page, perPage);
  }

  /**
   * Single round-trip status breakdown, replacing what used to be 6
   * separate list({perPage:1}) calls (one per status) just to read their
   * totals. One $facet aggregation scans the (search/date-filtered)
   * collection once and counts every status bucket in parallel branches.
   *
   * Scope choice: counts respect `search`/`after`/`before` exactly like
   * list() does, so "counts for Hier" and "the orders list for Hier" always
   * agree — deliberately NOT always-global, see docs on the admin orders
   * page for why. `total` here is the "Normal" tab total (pending +
   * confirmed + every attempt + cancelled) — abandoned/trash are separate,
   * intentionally-excluded buckets, exactly like the tab split already
   * works; see OrderStatusCounts in contracts/order.ts for the exact shape.
   */
  async counts(
    query: Pick<OrderListQueryDto, 'search' | 'after' | 'before' | 'productId' | 'status' | 'tab'> = {},
  ): Promise<OrderStatusCounts> {
    const searchCondition = query.search
      ? {
          $or: [
            { 'customer.firstName': { $regex: query.search, $options: 'i' } },
            { 'customer.phone': { $regex: query.search, $options: 'i' } },
            { orderNumber: Number.isNaN(Number(query.search)) ? -1 : Number(query.search) },
          ],
        }
      : null;

    const hasDate = Boolean(query.after || query.before);
    const dateRange = hasDate
      ? {
          ...(query.after ? { $gte: new Date(query.after) } : {}),
          ...(query.before ? { $lte: new Date(query.before) } : {}),
        }
      : null;

    const countBranch = (status: string) => {
      const ands: Record<string, unknown>[] = [{ status }];
      if (query.productId) ands.push({ 'items.productId': query.productId });
      if (searchCondition) ands.push(searchCondition);
      if (dateRange) {
        if (status === 'confirme') {
          ands.push({
            $or: [
              { confirmedAt: dateRange },
              { confirmedAt: null, createdAt: dateRange },
            ],
          });
        } else {
          ands.push({ createdAt: dateRange });
        }
      }
      return [{ $match: { $and: ands } }, { $count: 'n' }];
    };

    // Scope conditions for product order count aggregation:
    // Respects current tab, active status, date range, and search query.
    const productScopeAnds: Record<string, unknown>[] = [];
    const activeTab = query.tab || 'normal';
    if (activeTab === 'trash') {
      productScopeAnds.push({ status: 'trash' });
    } else if (activeTab === 'abandoned') {
      productScopeAnds.push({ status: { $in: ['checkout-draft', 'abandoned', 'abondonne'] } });
    } else {
      // Normal tab
      if (query.status) {
        if (query.status === 'tentative') {
          productScopeAnds.push({
            status: { $in: ['tentative-1', 'tentative-2', 'tentative-3', 'tentative-4', 'tentative-5'] },
          });
        } else {
          productScopeAnds.push({ status: query.status });
        }
      } else {
        productScopeAnds.push({
          status: { $in: ['en-attente', 'confirme', 'tentative-1', 'tentative-2', 'tentative-3', 'tentative-4', 'tentative-5', 'annule'] },
        });
      }
    }

    if (searchCondition) productScopeAnds.push(searchCondition);
    if (dateRange) {
      if (query.status === 'confirme') {
        productScopeAnds.push({
          $or: [
            { confirmedAt: dateRange },
            { confirmedAt: null, createdAt: dateRange },
          ],
        });
      } else {
        productScopeAnds.push({ createdAt: dateRange });
      }
    }

    const productBranch: unknown[] = [
      { $match: productScopeAnds.length > 0 ? { $and: productScopeAnds } : {} },
      {
        $project: {
          productIds: {
            $setUnion: [
              {
                $map: {
                  input: { $ifNull: ['$items', []] },
                  as: 'item',
                  in: '$$item.productId',
                },
              },
              [],
            ],
          },
        },
      },
      { $unwind: '$productIds' },
      {
        $group: {
          _id: '$productIds',
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { orderCount: -1 } },
    ];

    const [facets] = await this.model.aggregate<Record<string, { n?: number; _id?: string; orderCount?: number }[]>>([
      {
        $facet: {
          pending: countBranch('en-attente'),
          confirmed: countBranch('confirme'),
          attempt1: countBranch('tentative-1'),
          attempt2: countBranch('tentative-2'),
          attempt3: countBranch('tentative-3'),
          attempt4: countBranch('tentative-4'),
          attempt5: countBranch('tentative-5'),
          cancelled: countBranch('annule'),
          abandoned: countBranch('checkout-draft'),
          trash: countBranch('trash'),
          products: productBranch as never,
        },
      },
    ]);

    const n = (key: string): number => (facets?.[key]?.[0] as { n?: number } | undefined)?.n ?? 0;
    const attempt1 = n('attempt1');
    const attempt2 = n('attempt2');
    const attempt3 = n('attempt3');
    const attempt4 = n('attempt4');
    const attempt5 = n('attempt5');
    const attemptsTotal = attempt1 + attempt2 + attempt3 + attempt4 + attempt5;
    const pending = n('pending');
    const confirmed = n('confirmed');
    const cancelled = n('cancelled');

    const products = Array.isArray(facets?.products)
      ? facets.products.map((p) => ({
          productId: String(p._id),
          orderCount: Number(p.orderCount) || 0,
        }))
      : [];

    return {
      total: pending + confirmed + attemptsTotal + cancelled,
      pending,
      confirmed,
      attempts: { total: attemptsTotal, attempt1, attempt2, attempt3, attempt4, attempt5 },
      cancelled,
      abandoned: n('abandoned'),
      trash: n('trash'),
      products,
    };
  }

  async ordersByPhone(phone: string) {
    const docs = await this.model.find({ 'customer.phone': phone }).sort({ createdAt: -1 }).limit(20);
    return docs.map((d) => toOrderContract(d));
  }

  /**
   * Admin/employee order edits — the backend owns the whole confirmed-order
   * modification transaction:
   *
   *   1. load persisted order + optimistic-concurrency check (version)
   *   2. resolve requested items against the catalog
   *   3. diff old vs new — a no-op edit returns untouched (no reason, no
   *      stock movement, no audit, no write)
   *   4. a meaningful change on an already-committed order REQUIRES a
   *      modification reason
   *   5. inventory deltas (only the difference; idempotent by construction —
   *      a re-save of the same state yields delta 0) unless the business has
   *      stock tracking disabled (settings.inventory.enabled=false)
   *   6. apply fields, recompute totals, status transition, bump version
   *   7. rich audit entry (before/after values, changed fields, per-line
   *      changes, reason) — all inside one transaction, rolled back together.
   *
   * Totals are ALWAYS recomputed server-side from the resolved items
   * (computeOrderTotals) — patch.subtotal/patch.total only ever feed the
   * separate manualSubtotalMinor/manualTotalMinor override fields (an
   * explicit, clearly-labeled admin override the mapper already prefers
   * when present), never the real computed totals.
   */
  async update(id: string, patch: UpdateOrderDto, actor: AuditActor): Promise<OrderResponse> {
    let doc = await this.findDoc(id);

    // Optimistic concurrency: the editor must write against the version it
    // loaded. Any other write since (another employee's edit, a status
    // change, a carrier push) bumps it — silently overwriting someone
    // else's save is exactly what this guards against.
    const currentVersion = doc.version ?? 0;
    if (patch.version !== undefined && patch.version !== currentVersion) {
      throw new ConflictException('Cette commande a été modifiée depuis son ouverture. Rechargez-la avant d\'enregistrer.');
    }

    const beforeItems = snapshotItems(doc.items);
    const resolved = patch.items ? await this.resolveUpdateItems(patch.items) : null;
    const afterItems: ItemSnapshot[] = resolved ? resolved.map((l) => ({
      productId: l.productId,
      variantId: l.variantId,
      qty: l.qty,
      unitPriceMinor: l.unitPriceMinor,
      variation: l.variation,
      bundleName: l.bundleName,
      bundleSlot: l.bundleSlot,
    })) : beforeItems;

    // ── 3. Real change detection (never index-based guessing) ────────────
    const itemDiff = diffItems(beforeItems, afterItems);
    const changedFields: string[] = [];
    if (hasItemChanges(itemDiff)) changedFields.push('items');
    if (patch.shipping !== undefined && toMinor(patch.shipping) !== doc.shippingMinor) changedFields.push('shipping');
    if (patch.deliveryCompany !== undefined && patch.deliveryCompany !== doc.deliveryCompany) changedFields.push('deliveryCompany');
    if (patch.exchange !== undefined && patch.exchange !== doc.exchange) changedFields.push('exchange');
    if (patch.privateNote !== undefined && patch.privateNote !== doc.privateNote) changedFields.push('privateNote');
    if (patch.status && patch.status !== doc.status) changedFields.push('status');
    if (patch.customer) changedFields.push(...diffCustomer(snapshotCustomer(doc.customer), patch.customer as Order['customer']));
    if (patch.attempts !== undefined && patch.attempts !== doc.attempts) changedFields.push('attempts');
    if (patch.subtotal !== undefined && toMinor(patch.subtotal) !== (doc.manualSubtotalMinor ?? null)) changedFields.push('manualSubtotal');
    if (patch.total !== undefined && toMinor(patch.total) !== (doc.manualTotalMinor ?? null)) changedFields.push('manualTotal');

    const changed = [...new Set(changedFields)];

    // Nothing meaningful changed — do not write, do not move stock, do not
    // audit, do not demand a reason. This also makes retries idempotent:
    // re-sending the exact same save after a successful one is a no-op.
    if (changed.length === 0) {
      return toOrderContract(doc);
    }

    // ── 4. Reason gate for already-committed orders ──────────────────────
    const wasCommitted = doc.stockCommitted ?? (stockEffectForStatus(doc.status) === 'commit');
    if (wasCommitted && !patch.reason?.trim()) {
      throw new BadRequestException('Motif de modification requis.');
    }

    const before: OrderSnapshot = {
      status: doc.status,
      customer: snapshotCustomer(doc.customer),
      items: beforeItems,
      shippingMinor: doc.shippingMinor,
      deliveryCompany: doc.deliveryCompany,
      exchange: doc.exchange,
      privateNote: doc.privateNote,
      attempts: doc.attempts,
      manualSubtotalMinor: doc.manualSubtotalMinor ?? null,
      manualTotalMinor: doc.manualTotalMinor ?? null,
    };

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        doc = await this.model.findById(id).session(session) as OrderDocument;
        if ((doc.version ?? 0) !== currentVersion) throw new ConflictException('Commande modifiée, rechargez-la.');
        await this.model.updateOne({ _id: id }, { $inc: { version: 1 } }, { session });
        // Edit only the exact-variant delta. A tracked order must remain
        // accounted for even if the global setting changed after its sale.
        const itemsChanged = itemDiff.added.length + itemDiff.removed.length + itemDiff.changed.length > 0;
        if (wasCommitted && itemsChanged && (await this.settings.getInventorySettings()).enabled === false) {
          throw new BadRequestException('Réactivez le mode avec stock pour modifier les articles de cette commande déjà déduite.');
        }
        if (wasCommitted && itemsChanged) {
          const exactBefore = await Promise.all(beforeItems.map(async line => ({ ...line, variantId: await this.inventory.resolveHistoricalVariant(line.productId, line.variantId, line.variation) })));
          const exactAfter = await Promise.all(afterItems.map(async line => ({ ...line, variantId: await this.inventory.resolveHistoricalVariant(line.productId, line.variantId, line.variation) })));
          const deltas = computeStockDeltas(exactBefore, exactAfter);
          const strict = true;
          for (const [identity, delta] of deltas) {
            const stockLine = [...exactAfter, ...exactBefore].find(l => (l.variantId ?? l.productId) === identity)!;
            const productId = stockLine.productId;
            const variantId = stockLine.variantId;
            if (delta > 0) {
              try {
                await this.inventory.commit(productId, delta, id, actor, session, strict, variantId);
              } catch (err) {
                if (err instanceof InsufficientStockError) {
                  throw new BadRequestException('Stock insuffisant pour augmenter la quantité.');
                }
                throw err;
              }
            } else {
              await this.inventory.adjust(productId, -delta, `Modification de commande #${doc.orderNumber}`, actor, session, undefined, variantId, { type: 'correction', orderId: id });
            }
          }
        }

        // ── 6. Apply fields ──────────────────────────────────────────────
        if (patch.customer) Object.assign(doc.customer, patch.customer);
        if (patch.deliveryCompany !== undefined) doc.deliveryCompany = patch.deliveryCompany;
        if (patch.exchange !== undefined) doc.exchange = patch.exchange;
        if (patch.privateNote !== undefined) doc.privateNote = patch.privateNote;
        if (patch.subtotal !== undefined) doc.manualSubtotalMinor = toMinor(patch.subtotal);
        if (patch.total !== undefined) doc.manualTotalMinor = toMinor(patch.total);
        if (patch.attempts !== undefined) doc.attempts = patch.attempts;

        if (resolved) doc.items = resolved as unknown as Order['items'];

        if (patch.shipping !== undefined) doc.shippingMinor = toMinor(patch.shipping);

        if (resolved || patch.shipping !== undefined) {
          const totals = computeOrderTotals(
            doc.items.map((i) => ({ unitPriceMinor: i.unitPriceMinor, qty: i.qty })),
            doc.shippingMinor,
            doc.discountMinor,
          );
          doc.subtotalMinor = totals.subtotalMinor;
          doc.totalMinor = totals.totalMinor;
        }

        if (patch.status && patch.status !== doc.status) {
          await this.applyStatusTransition(doc, patch.status, actor, patch.reason?.trim() ?? null, session);
        }

        doc.version = currentVersion + 1;
        await doc.save({ session });
      });

      // ── 7. Modification history — before/after, changed fields, per-line
      //     changes, reason, employee. Written after commit so the snapshot
      //     is stable; audit logging itself is best-effort (see AuditService).
      const after: OrderSnapshot = {
        status: doc.status,
        customer: snapshotCustomer(doc.customer),
        items: afterItems,
        shippingMinor: doc.shippingMinor,
        deliveryCompany: doc.deliveryCompany,
        exchange: doc.exchange,
        privateNote: doc.privateNote,
        attempts: doc.attempts,
        manualSubtotalMinor: doc.manualSubtotalMinor ?? null,
        manualTotalMinor: doc.manualTotalMinor ?? null,
      };
      if (changed.some((f) => f !== 'status')) {
        await this.audit.log({
          actor,
          action: 'order.update',
          entityType: 'order',
          entityId: id,
          summary: patch.reason ? `Commande modifiée — ${patch.reason}` : 'Commande modifiée',
          before: {
            ...before,
            items: before.items,
            orderNumber: doc.orderNumber,
          },
          after: {
            ...after,
            items: after.items,
            changedFields: changed,
            lineChanges: itemDiff.changed,
            orderNumber: doc.orderNumber,
            reason: patch.reason?.trim() ?? null,
          },
          ip: null,
        });
      }

      if (doc.status !== DRAFT_STATUS) await this.maybeEnqueueAutoPush(doc);
      return toOrderContract(await this.model.findById(id) as OrderDocument);
    } finally {
      await session.endSession();
    }
  }

  /** Resolves admin-edited order lines against the current catalog —
   *  same field shape as resolveLines() but driven by OrderUpdateItemDto
   *  (productId/qty/unitPrice override/variation), used only from update(). */
  private async resolveUpdateItems(items: { productId: string; variantId?: string; qty: number; unitPrice?: number; variation?: Record<string, string>; bundleName?: string; bundleSlot?: number }[]): Promise<ResolvedLine[]> {
    if (items.some((i) => i.qty <= 0)) throw new BadRequestException('La quantité doit être supérieure à zéro');
    const productIds = [...new Set(items.map((i) => i.productId))];
    const productDocs = await this.products.find({ _id: { $in: productIds } });
    const byId = new Map(productDocs.map((p) => [p.id, p]));

    return Promise.all(items.map(async (item) => {
      const product = byId.get(item.productId);
      if (!product) throw new BadRequestException(`Produit introuvable: ${item.productId}`);
      const variant = await this.inventory.resolveSaleVariant(product.id, item.variantId);
      const unitPriceMinor = item.unitPrice != null ? toMinor(item.unitPrice) : (variant.sellingPriceMinor ?? product.salePriceMinor ?? product.regularPriceMinor);
      return {
        productId: product.id,
        variantId: variant.id,
        name: product.name,
        slug: product.slug,
        imageUrl: normalizePublicMediaUrl(primaryProductImage(product.images)?.url ?? null),
        qty: item.qty,
        unitPriceMinor,
        totalMinor: unitPriceMinor * item.qty,
        variation: product.inventoryModel === 'MATRIX' ? { Taille: variant.attributes.size, Couleur: variant.attributes.color } : item.variation ?? null,
        bundleName: item.bundleName ?? null,
        bundleSlot: item.bundleSlot ?? null,
        costMinor: product.costMinor ?? 0,
        categoryIds: product.categoryIds ?? [],
      };
    }));
  }

  async changeStatus(id: string, status: string, actor: AuditActor): Promise<OrderResponse> {
    let doc = await this.findDoc(id);
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        doc = await this.model.findById(id).session(session) as OrderDocument;
        await this.model.updateOne({ _id: id }, { $inc: { version: 1 } }, { session });
        await this.applyStatusTransition(doc, status, actor, null, session);
        doc.version = (doc.version ?? 0) + 1;
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

    return Promise.all(dto.items.map(async (item) => {
      const product = byId.get(item.productId);
      if (!product) throw new BadRequestException(`Produit introuvable: ${item.productId}`);
      if (product.posOnly) throw new BadRequestException(`Produit non disponible à la vente en ligne: ${product.name}`);

      const variant = await this.inventory.resolveSaleVariant(product.id, item.variantId);
      let unitPriceMinor: number;
      const bundle = item.bundleId ? product.bundles.find((b) => b.id === item.bundleId) : undefined;
      if (bundle) {
        unitPriceMinor = Math.round(priceExplicitBundle(bundle).totalMinor / Math.max(1, bundle.quantity));
      } else {
        unitPriceMinor = variant.sellingPriceMinor ?? product.salePriceMinor ?? product.regularPriceMinor;
      }

      return {
        productId: product.id,
        variantId: variant.id,
        name: product.name,
        slug: product.slug,
        imageUrl: normalizePublicMediaUrl(primaryProductImage(product.images)?.url ?? null),
        qty: item.qty,
        unitPriceMinor,
        totalMinor: unitPriceMinor * item.qty,
        variation: product.inventoryModel === 'MATRIX' ? { Taille: variant.attributes.size, Couleur: variant.attributes.color } : item.variation ?? null,
        bundleName: item.bundleName ?? null,
        bundleSlot: item.bundleSlot ?? null,
        costMinor: product.costMinor ?? 0,
        categoryIds: product.categoryIds ?? [],
      };
    }));
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
    const fromEffect = (doc.stockCommitted ?? (stockEffectForStatus(from) === 'commit')) ? 'commit' : 'none';
    const toEffect = stockEffectForStatus(nextStatus);
    const remainsUntracked = doc.stockCommitted === false && stockEffectForStatus(from) === 'commit' && toEffect === 'commit';
    const action = isTrashTransition || remainsUntracked ? 'none' : planStockTransition(fromEffect, toEffect);
    const strict = true;

    const inventoryEnabled = (await this.settings.getInventorySettings()).enabled !== false;
    // Reversing an earlier tracked sale restores its actual deduction even
    // when new sales currently run without stock tracking.
    for (const item of inventoryEnabled || action === 'restock' ? doc.items : []) {
      const variantId = action === 'commit' || action === 'restock' ? await this.inventory.resolveHistoricalVariant(item.productId, item.variantId, item.variation) : item.variantId;
      if (action === 'reserve') {
        await this.inventory.reserve(item.productId, item.qty, doc.id, actor, false, session);
      } else if (action === 'commit') {
        // The normal path: 'en-attente' (fromEffect 'none') → 'confirme'.
        // Nothing was reserved earlier, so this single commit() call is
        // both the availability check (in strict mode) and the deduction.
        try {
          await this.inventory.commit(item.productId, item.qty, doc.id, actor, session, strict, variantId);
        } catch (err) {
          if (err instanceof InsufficientStockError) {
            throw new BadRequestException(`Stock insuffisant pour ${item.name}`);
          }
          throw err;
        }
      } else if (action === 'release') {
        await this.inventory.release(item.productId, item.qty, doc.id, actor, session);
      } else if (action === 'restock') {
        await this.inventory.adjust(item.productId, item.qty, `Annulation commande #${doc.orderNumber}`, actor, session, undefined, variantId, { type: 'refund_restock', orderId: doc.id });
      }
    }

    if (action === 'commit') doc.stockCommitted = inventoryEnabled;
    if (action === 'restock') doc.stockCommitted = false;
    if (!isTrashTransition && toEffect === 'release' && doc.coupon) {
      await this.coupons.releaseRedemption(doc.coupon.couponId, doc.id, session);
    }

    await this.maybeEarnLoyaltyPoints(doc, from, nextStatus, session);

    // The attempt number now lives IN the status (tentative-N) — this keeps
    // the legacy `attempts` field (still exposed as meta._mzem_attempts for
    // any code still reading it) authoritatively in sync instead of trusting
    // a caller-supplied value that could drift from the real status, which
    // is exactly how orders used to end up displaying "Tentative 0".
    const attemptNumber = getAttemptNumber(nextStatus);
    if (attemptNumber !== null) doc.attempts = attemptNumber;

    if (nextStatus === 'confirme' || stockEffectForStatus(nextStatus) === 'commit') {
      if (!doc.confirmedAt) {
        doc.confirmedAt = new Date();
      }
    }

    doc.status = nextStatus;
    doc.statusHistory.push({ from, to: nextStatus, by: actor, at: new Date(), note } as Order['statusHistory'][number]);
    await this.audit.log({
      actor,
      action: 'order.status_change',
      entityType: 'order',
      entityId: doc.id,
      summary: note ? `Statut changé de "${from}" à "${nextStatus}" — ${note}` : `Statut changé de "${from}" à "${nextStatus}"`,
      before: { status: from },
      after: { status: nextStatus, note },
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

  private get isStrictStock(): boolean {
    const val = this.config.get('STRICT_STOCK');
    return val === true || val === 'true' || process.env.STRICT_STOCK === 'true';
  }
}

/** Kept for callers that still import the WooCommerce-era payload shape name. */
export type { CheckoutPayload };
export { DEFAULT_STATUS };
