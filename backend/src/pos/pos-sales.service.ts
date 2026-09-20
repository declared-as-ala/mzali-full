import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, FilterQuery, Model, Types } from 'mongoose';
import type { CreatePosSaleInput, EmployeeRole, PosPrintStatus, PosSale as PosSaleContract, PosSaleLineInput, PosSalePaymentInput } from '@contracts';
import { Product } from '@/catalog/product.schema';
import { distributeGroupPricing, priceBestCombination, ProductBundleLike } from '@/catalog/product-pricing';
import { ProductVariantsService } from '@/catalog/product-variants.service';
import { ProductsService } from '@/catalog/products.service';
import { addMinor, clampDiscount, toMinor } from '@/common/money';
import { clampPagination } from '@/common/pagination';
import { CountersService } from '@/database/counters.service';
import { InsufficientStockError, StockLedgerService } from '@/inventory/stock-ledger.service';
import { LoyaltyLedgerService } from '@/loyalty/loyalty-ledger.service';
import { LoyaltyRulesService } from '@/loyalty/loyalty-rules.service';
import { LoyaltyService } from '@/loyalty/loyalty.service';
import { Employee } from '@/users/employee.schema';
import { Customer } from '@/customers/customer.schema';
import { SettingsService } from '@/settings/settings.service';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { computeSaleStockDeltas, sumByMethod } from './pos-sale-calc';
import { PosPayment } from './pos-payment.schema';
import { PosSale, PosSaleDocument, PosSaleLine } from './pos-sale.schema';
import { PosSessionsService } from './pos-sessions.service';

export type PosSaleContext = {
  terminalId: string;
  locationId: string;
  cashierId: string;
  cashierName: string;
  cashierRole: EmployeeRole;
};

@Injectable()
export class PosSalesService {
  constructor(
    @InjectModel(PosSale.name) private readonly sales: Model<PosSale>,
    @InjectModel(PosPayment.name) private readonly payments: Model<PosPayment>,
    @InjectModel(Employee.name) private readonly employees: Model<Employee>,
    @InjectModel(Customer.name) private readonly customers: Model<Customer>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    private readonly products: ProductsService,
    private readonly variants: ProductVariantsService,
    private readonly ledger: StockLedgerService,
    private readonly counters: CountersService,
    private readonly sessions: PosSessionsService,
    private readonly loyalty: LoyaltyService,
    private readonly loyaltyRules: LoyaltyRulesService,
    private readonly loyaltyLedger: LoyaltyLedgerService,
    private readonly settings: SettingsService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async create(input: CreatePosSaleInput, ctx: PosSaleContext, idempotencyKey?: string): Promise<{ doc: PosSaleDocument; wasExisting: boolean }> {
    if (idempotencyKey) {
      const existing = await this.sales.findOne({ idempotencyKey });
      if (existing) {
        if (existing.terminalId !== ctx.terminalId || existing.cashierId !== ctx.cashierId) throw new ConflictException('Clé de paiement déjà utilisée');
        return { doc: existing, wasExisting: true };
      }
    }
    if (ctx.locationId !== 'BOUTIQUE') throw new BadRequestException('Le POS doit utiliser le stock Boutique.');
    if (!input.lines.length) throw new BadRequestException('Le panier est vide');
    if (!input.payments?.length) throw new BadRequestException('Au moins un mode de paiement est requis');

    const openSession = await this.sessions.getOpenForTerminal(ctx.terminalId);
    if (!openSession) throw new BadRequestException("Aucune session de caisse ouverte sur ce terminal");
    await this.sessions.assertAccess(openSession.id, ctx.terminalId, ctx.cashierId, ['admin', 'super_admin', 'store_manager'].includes(ctx.cashierRole));

    // Recalculate every price server-side — never trust a client-sent
    // amount (same principle as online checkout).
    const { lines: resolved, categoryIdsByProductId } = await this.resolveSaleLines(input.lines);

    const stockTracked = (await this.settings.getInventorySettings()).enabled !== false;
    const saleId = new Types.ObjectId();
    const run = async (session?: ClientSession) => {
      for (const line of stockTracked ? resolved : []) {
        try {
          await this.ledger.applyMovement({
            variantId: line.variantId,
            locationId: ctx.locationId,
            type: 'pos_sale',
            onHandDelta: -line.qty,
            requireAvailableAtLeast: line.qty,
            reference: saleId.toString(),
            actor: { type: 'employee', id: ctx.cashierId, name: ctx.cashierName },
            session,
          });
        } catch (err) {
          if (err instanceof InsufficientStockError) {
            throw new BadRequestException(`Stock boutique insuffisant pour ${line.descriptionSnapshot}`);
          }
          throw err;
        }
      }

      const subtotalMinor = addMinor(...resolved.map((l) => l.lineTotalMinor));
      let discountMinor = clampDiscount(input.discountMinor ?? 0, subtotalMinor);

      // Loyalty redemption — guards validated first, points deducted and
      // the discount folded into the sale total inside this same
      // transaction, so a sale is never left half-applied.
      let loyaltyAccountId: string | null = null;
      let loyaltyDiscountMinor = 0;
      if (input.redeemPoints) {
        if (!input.customerId) throw new BadRequestException('Un client est requis pour utiliser des points de fidélité');
        const account = await this.loyalty.getByCustomerId(input.customerId);
        if (!account) throw new BadRequestException('Aucun compte de fidélité pour ce client');
        const preview = await this.loyalty.validateRedemption(
          account,
          input.redeemPoints,
          subtotalMinor - discountMinor,
          input.managerApproval,
          ctx.cashierRole,
        );
        if (!preview.valid) throw new BadRequestException(preview.error ?? 'Échange de points invalide');
        loyaltyAccountId = account.id;
        loyaltyDiscountMinor = preview.discountMinor;
        discountMinor = clampDiscount(discountMinor + loyaltyDiscountMinor, subtotalMinor);
      }

      const totalMinor = subtotalMinor - discountMinor;

      const paymentsSum = addMinor(...input.payments.map((p) => p.amountMinor));
      if (paymentsSum !== totalMinor) {
        throw new BadRequestException(`La somme des paiements (${paymentsSum}) ne correspond pas au total (${totalMinor})`);
      }
      const cashRow = input.payments.find((p) => p.method === 'CASH');
      const cashAmountMinor = input.payments.filter((p) => p.method === 'CASH').reduce((sum, p) => sum + p.amountMinor, 0);
      const cashTenderedMinor = cashRow ? input.cashTenderedMinor ?? cashAmountMinor : null;
      if (cashTenderedMinor !== null && (!Number.isSafeInteger(cashTenderedMinor) || cashTenderedMinor < cashAmountMinor)) throw new BadRequestException('Espèces reçues insuffisantes');
      const legacyMethod = input.payments.length > 1 ? 'MIXED' : mapLegacyMethod(input.payments[0].method);

      // Earning — only for customers with an existing ACTIVE loyalty
      // account (opt-in, never auto-created here). Computed on each line's
      // post-line-discount total; the sale-level manual/redemption
      // discount is not proportionally subtracted (deliberate v1
      // simplification — see progress.md SPRINT-08).
      const earningAccount = input.customerId
        ? loyaltyAccountId
          ? await this.loyalty.getById(loyaltyAccountId)
          : await this.loyalty.getByCustomerId(input.customerId)
        : null;
      let loyaltyPointsEarned = 0;
      if (earningAccount && earningAccount.status === 'ACTIVE') {
        loyaltyPointsEarned = await this.loyaltyRules.calculateEarnedPoints({
          lines: resolved.map((l) => ({
            productId: l.productId,
            categoryIds: categoryIdsByProductId.get(l.productId) ?? [],
            totalMinor: l.lineTotalMinor,
          })),
          shippingMinor: 0,
        });
      }

      const saleNumber = await this.counters.next('pos-sale', session);
      const now = new Date();

      const [doc] = await this.sales.create(
        [
          {
            _id: saleId,
          stockTracked,
            saleNumber,
            terminalId: ctx.terminalId,
            cashierId: ctx.cashierId,
            sessionId: openSession.id,
            locationId: ctx.locationId,
            status: 'COMPLETED',
            lines: resolved,
            customerId: input.customerId ?? null,
            subtotalMinor,
            discountMinor,
            totalMinor,
            paymentMethod: legacyMethod,
            cashReceivedMinor: cashTenderedMinor,
            changeMinor: cashRow && cashTenderedMinor !== null ? cashTenderedMinor - cashAmountMinor : null,
            idempotencyKey: idempotencyKey ?? undefined,
            loyaltyPointsEarned,
            loyaltyPointsRedeemed: input.redeemPoints ?? 0,
            loyaltyDiscountMinor,
            completedAt: now,
          },
        ],
        { session },
      );

      if (loyaltyAccountId && input.redeemPoints) {
        await this.loyalty.commitRedemption(loyaltyAccountId, input.redeemPoints, saleId.toString(), ctx.cashierId, session);
      }
      if (earningAccount && loyaltyPointsEarned > 0) {
        await this.loyaltyLedger.apply({
          accountId: earningAccount.id,
          type: 'EARN',
          pointsDelta: loyaltyPointsEarned,
          sourceType: 'POS_SALE',
          sourceId: saleId.toString(),
          session,
        });
      }

      await this.payments.create(
        input.payments.map((p) => ({
          saleId: saleId.toString(),
          sessionId: openSession.id,
          method: p.method,
          amountMinor: p.amountMinor,
          status: 'PAID',
          receivedBy: ctx.cashierId,
          receivedAt: now,
        })),
        { session, ordered: true },
      );

      const byMethod = (method: PosSalePaymentInput['method']) =>
        addMinor(0, ...input.payments.filter((p) => p.method === method).map((p) => p.amountMinor));
      await this.sessions.applySaleToSession(
        openSession.id,
        {
          totalMinor,
          discountMinor,
          saleId: saleId.toString(), actorId: ctx.cashierId,
          cashMinor: byMethod('CASH'),
          cardMinor: byMethod('CARD'),
          otherMinor: byMethod('BANK_TRANSFER') + byMethod('OTHER'),
        },
        session,
      );

      return doc;
    };

    try {
      const doc = await withOptionalTxn(this.connection, run);
      return { doc, wasExisting: false };
    } catch (error) {
      if (idempotencyKey && (error as { code?: number }).code === 11000) {
        const existing = await this.sales.findOne({ idempotencyKey, terminalId: ctx.terminalId, cashierId: ctx.cashierId });
        if (existing) return { doc: existing, wasExisting: true };
      }
      throw error;
    }
  }

  /**
   * Live pricing preview — runs the exact same offer-pricing logic as
   * create(), with no stock deduction or persistence, so the till screen can
   * show the authoritative total as the cashier edits the cart without the
   * frontend ever computing a price itself.
   */
  async quote(inputLines: PosSaleLineInput[]): Promise<{ lines: PosSaleLine[]; subtotalMinor: number }> {
    const { lines } = await this.resolveSaleLines(inputLines);
    return { lines, subtotalMinor: addMinor(...lines.map((l) => l.lineTotalMinor)) };
  }

  /**
   * Resolves raw cart lines into priced `PosSaleLine`s — the single place
   * where POS pricing happens, shared by create() and update() so a sale
   * edit re-prices offers exactly the same way a fresh sale does. Never
   * trusts a client-sent price (same principle as online checkout).
   *
   * Lines that carry a `bundleGroupId` are grouped by (productId,
   * bundleGroupId), their quantities summed, and priced together via
   * `priceBestCombination()` — the product's configured quantity offers
   * (`Product.bundles`) plus regular-priced leftover units, picked by true
   * price-minimizing search, not a greedy heuristic. `distributeGroupPricing()`
   * then splits that group total back down to one priced line per physical
   * variant (so two different sizes bought under one "2 for 45 DT" offer
   * stay two lines, sharing the same bundleId for the receipt/cart to group
   * visually). Lines without a bundleGroupId are priced individually at the
   * plain regular price, exactly as before offers existed — a line simply
   * opts out of automatic offer pricing by omitting it.
   */
  private async resolveSaleLines(inputLines: PosSaleLineInput[]): Promise<{ lines: PosSaleLine[]; categoryIdsByProductId: Map<string, string[]> }> {
    const categoryIdsByProductId = new Map<string, string[]>();

    const resolvedInputs = await Promise.all(
      inputLines.map(async (line) => {
        const variant = await this.variants.findById(line.variantId);
        if (!variant || !variant.active || variant.retired) throw new NotFoundException(`Variante introuvable: ${line.variantId}`);
        const product = await this.products.getById(variant.productId);
        if (!product) throw new NotFoundException(`Produit introuvable pour la variante ${line.variantId}`);
        categoryIdsByProductId.set(variant.productId, product.categoryIds ?? []);
        const qty = Math.max(1, Math.round(line.qty));
        const regularUnitPriceMinor = variant.sellingPriceMinor ?? toMinor(product.price);
        return { line, variant, product, qty, regularUnitPriceMinor };
      }),
    );
    type ResolvedInput = (typeof resolvedInputs)[number];

    // Split into offer-priced groups (same product + client-shared
    // bundleGroupId) vs. plain lines (no bundleGroupId — no offer logic).
    const groups = new Map<string, ResolvedInput[]>();
    const ungrouped: ResolvedInput[] = [];
    for (const r of resolvedInputs) {
      if (!r.line.bundleGroupId || r.variant.sellingPriceMinor != null) {
        ungrouped.push(r);
        continue;
      }
      const key = `${r.variant.productId}::${r.line.bundleGroupId}`;
      const list = groups.get(key) ?? [];
      list.push(r);
      groups.set(key, list);
    }

    const lines: PosSaleLine[] = [];

    for (const r of ungrouped) {
      const discountMinor = clampDiscount(r.line.discountMinor ?? 0, r.regularUnitPriceMinor * r.qty);
      lines.push({
        variantId: r.variant.id,
        productId: r.variant.productId,
        descriptionSnapshot: r.product.name,
        sku: r.variant.sku,
        variantAttributesSnapshot: r.variant.attributes ?? {},
        qty: r.qty,
        unitPriceMinor: r.regularUnitPriceMinor,
        discountMinor,
        lineTotalMinor: r.regularUnitPriceMinor * r.qty - discountMinor,
        bundleGroupId: null,
        bundleId: null,
        bundleName: null,
        regularUnitPriceMinor: r.regularUnitPriceMinor,
      });
    }

    for (const group of groups.values()) {
      const regularUnitPriceMinor = group[0].regularUnitPriceMinor;
      const rawProduct = await this.productModel.findById(group[0].variant.productId);
      const bundles: ProductBundleLike[] = rawProduct?.bundles ?? [];
      const totalQty = group.reduce((s, r) => s + r.qty, 0);
      const plan = priceBestCombination(totalQty, regularUnitPriceMinor, bundles);

      const units = group.flatMap((r) => Array.from({ length: r.qty }, () => ({ unitKey: r.variant.id })));
      const runs = distributeGroupPricing(units, plan, regularUnitPriceMinor);

      // Manual per-line discounts (rare alongside an automatic offer) are
      // summed per variant and applied once, to that variant's first priced
      // run in this group.
      const discountByVariant = new Map<string, number>();
      for (const r of group) {
        if (!r.line.discountMinor) continue;
        discountByVariant.set(r.variant.id, (discountByVariant.get(r.variant.id) ?? 0) + r.line.discountMinor);
      }
      const appliedDiscountVariants = new Set<string>();

      for (const run of runs) {
        const source = group.find((r) => r.variant.id === run.unitKey)!;
        let discountMinor = 0;
        if (!appliedDiscountVariants.has(run.unitKey) && discountByVariant.has(run.unitKey)) {
          discountMinor = clampDiscount(discountByVariant.get(run.unitKey)!, run.lineTotalMinor);
          appliedDiscountVariants.add(run.unitKey);
        }
        lines.push({
          variantId: source.variant.id,
          productId: source.variant.productId,
          descriptionSnapshot: source.product.name,
          sku: source.variant.sku,
          variantAttributesSnapshot: source.variant.attributes ?? {},
          qty: run.qty,
          unitPriceMinor: run.unitPriceMinor,
          discountMinor,
          lineTotalMinor: run.lineTotalMinor - discountMinor,
          bundleGroupId: source.line.bundleGroupId ?? null,
          bundleId: run.bundleId,
          bundleName: run.bundleName,
          regularUnitPriceMinor,
        });
      }
    }

    return { lines, categoryIdsByProductId };
  }

  /**
   * Edits a completed sale — customer/products/qty/discount/payment
   * method/notes. Only allowed while the sale's session is still OPEN: once
   * a session closes its Z-report snapshot is immutable (see
   * pos-cashier-session.schema.ts), so an edit afterwards would silently
   * desync the frozen report from the live totals. Totals are always
   * recomputed server-side (never trusts a client-sent total), stock moves
   * by the delta between old/new quantities (mirrors
   * OrdersService.update()'s computeStockDeltas pattern), and session
   * running totals move by the same delta so nothing is double-counted.
   */
  async update(id: string, dto: UpdateSaleDto, actor: { type: 'employee'; id: string; name: string }): Promise<{ before: PosSaleDocument; after: PosSaleDocument }> {
    const doc = await this.sales.findById(id);
    if (!doc) throw new NotFoundException('Vente introuvable');
    const beforeSnapshot = doc.$clone();
    if (doc.status !== 'COMPLETED') throw new BadRequestException('Seule une vente complétée peut être modifiée');

    const session = await this.sessions.requireOpen(doc.sessionId);
    if (doc.loyaltyPointsEarned || doc.loyaltyPointsRedeemed) throw new BadRequestException('Annulez puis recréez cette vente pour conserver son historique de fidélité');

    const oldPaymentRows = await this.payments.find({ saleId: doc.id });
    const oldCashMinor = sumByMethod(oldPaymentRows, 'CASH');
    const oldCardMinor = sumByMethod(oldPaymentRows, 'CARD');
    const oldOtherMinor = oldPaymentRows.reduce((s, p) => s + (p.method !== 'CASH' && p.method !== 'CARD' ? p.amountMinor : 0), 0);

    let resolvedLines: PosSaleLine[] = doc.lines;
    if (dto.lines) {
      resolvedLines = (await this.resolveSaleLines(dto.lines)).lines;
    }

    const subtotalMinor = resolvedLines.length > 0 ? addMinor(...resolvedLines.map((l) => l.lineTotalMinor)) : 0;
    const discountMinor = clampDiscount(dto.discountMinor ?? doc.discountMinor, subtotalMinor);
    const totalMinor = subtotalMinor - discountMinor;

    let payments = dto.payments;
    if (!payments) {
      if (totalMinor !== doc.totalMinor) {
        throw new BadRequestException('Le total de la vente a changé — les nouveaux paiements doivent être fournis');
      }
      payments = oldPaymentRows.map((p) => ({ method: (p.method === 'MIXED_COMPONENT' ? 'OTHER' : p.method) as PosSalePaymentInput['method'], amountMinor: p.amountMinor }));
    }
    const paymentsSum = addMinor(...payments.map((p) => p.amountMinor));
    if (paymentsSum !== totalMinor) {
      throw new BadRequestException(`La somme des paiements (${paymentsSum}) ne correspond pas au total (${totalMinor})`);
    }
    const newCashMinor = sumByMethod(payments, 'CASH');
    const newCardMinor = sumByMethod(payments, 'CARD');
    const newOtherMinor = payments.reduce((s, p) => s + (p.method !== 'CASH' && p.method !== 'CARD' ? p.amountMinor : 0), 0);
    const legacyMethod = payments.length > 1 ? 'MIXED' : mapLegacyMethod(payments[0].method);

    const stockDeltas = dto.lines ? computeSaleStockDeltas(beforeSnapshot.lines, resolvedLines) : new Map<string, number>();

    if (beforeSnapshot.stockTracked !== false && [...stockDeltas.values()].some(delta => delta !== 0) && (await this.settings.getInventorySettings()).enabled === false) {
      throw new BadRequestException('Réactivez le mode avec stock pour modifier les articles de cette vente déjà déduite.');
    }

    const run = async (txnSession?: ClientSession) => {
      // Reload on every transaction retry; an aborted save must not leave a
      // reused Mongoose document with cleared dirty fields.
      const doc = await this.sales.findOne({ _id: id, updatedAt: beforeSnapshot.updatedAt, status: 'COMPLETED' }).session(txnSession ?? null);
      if (!doc) throw new ConflictException('Cette vente a changé, rechargez-la');
      for (const [variantId, delta] of beforeSnapshot.stockTracked === false ? [] : stockDeltas) {
        try {
          await this.ledger.applyMovement({
            variantId,
            locationId: doc.locationId,
            type: 'correction',
            onHandDelta: -delta,
            requireAvailableAtLeast: delta > 0 ? delta : undefined,
            reference: doc.id,
            reason: `Modification vente #${doc.saleNumber} — ${dto.reason}`,
            actor,
            session: txnSession,
          });
        } catch (err) {
          if (err instanceof InsufficientStockError) {
            throw new BadRequestException('Stock boutique insuffisant pour appliquer cette modification');
          }
          throw err;
        }
      }

      const locked = await this.sales.updateOne({ _id: doc.id, updatedAt: beforeSnapshot.updatedAt, status: 'COMPLETED' }, { $set: { updatedAt: new Date() } }, { session: txnSession });
      if (!locked.matchedCount) throw new ConflictException('Cette vente a changé, rechargez-la');
      doc.lines = resolvedLines;
      doc.subtotalMinor = subtotalMinor;
      doc.discountMinor = discountMinor;
      doc.totalMinor = totalMinor;
      doc.paymentMethod = legacyMethod;
      if (dto.customerId !== undefined) doc.customerId = dto.customerId;
      if (dto.notes !== undefined) doc.notes = dto.notes;
      await doc.save({ session: txnSession });

      await this.payments.deleteMany({ saleId: doc.id }, { session: txnSession });
      await this.payments.create(
        payments!.map((p) => ({
          saleId: doc.id,
          sessionId: doc.sessionId,
          method: p.method,
          amountMinor: p.amountMinor,
          status: 'PAID' as const,
          receivedBy: actor.id,
          receivedAt: new Date(),
        })),
        { session: txnSession, ordered: true },
      );

      if (session && session.status === 'OPEN') {
        await this.sessions.applySaleEditToSession(
          doc.sessionId,
          {
            saleId: doc.id, actorId: actor.id, reason: dto.reason,
            totalMinor: totalMinor - beforeSnapshot.totalMinor,
            discountMinor: discountMinor - beforeSnapshot.discountMinor,
            cashMinor: newCashMinor - oldCashMinor,
            cardMinor: newCardMinor - oldCardMinor,
            otherMinor: newOtherMinor - oldOtherMinor,
          },
          txnSession,
        );
      }

      return doc;
    };

    const after = await withOptionalTxn(this.connection, run);
    return { before: beforeSnapshot, after };
  }

  async getById(id: string): Promise<PosSaleDocument | null> {
    return this.sales.findById(id).catch(() => null);
  }

  /**
   * Powers both the "Recent Sales" home-screen panel (small limit) and the
   * full sales-history page (paginated). `scopeToCashierId` is set by the
   * controller for callers without `pos.view_reports` — a plain cashier can
   * only browse their own tickets, a store manager sees the whole terminal.
   */
  async list(filter: {
    page?: number;
    perPage?: number;
    from?: Date;
    to?: Date;
    status?: string;
    search?: string;
    cashierId?: string;
    scopeToCashierId?: string;
  }): Promise<{ items: PosSaleDocument[]; total: number; page: number; perPage: number }> {
    const { page, perPage, skip } = clampPagination(filter.page, filter.perPage, 100);
    const query: FilterQuery<PosSaleDocument> = {};
    if (filter.from || filter.to) {
      query.createdAt = {};
      if (filter.from) query.createdAt.$gte = filter.from;
      if (filter.to) query.createdAt.$lte = filter.to;
    }
    if (filter.status) query.status = filter.status;
    const cashierId = filter.scopeToCashierId ?? filter.cashierId;
    if (cashierId) query.cashierId = cashierId;
    if (filter.search) {
      const asNumber = Number(filter.search);
      query.$or = [
        ...(Number.isFinite(asNumber) && filter.search.trim() !== '' ? [{ saleNumber: asNumber }] : []),
        { 'lines.descriptionSnapshot': { $regex: filter.search, $options: 'i' } },
        { 'lines.sku': { $regex: filter.search, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.sales.find(query).sort({ createdAt: -1 }).skip(skip).limit(perPage),
      this.sales.countDocuments(query),
    ]);
    return { items, total, page, perPage };
  }

  /** Same shape as list(), but resolves each row's cashier name in one
   *  batch query instead of the per-sale lookup toContract() does when
   *  called for a single ticket. */
  async listContracts(filter: Parameters<PosSalesService['list']>[0]): Promise<{ items: PosSaleContract[]; total: number; page: number; perPage: number }> {
    const { items, total, page, perPage } = await this.list(filter);
    if (!items.length) return { items: [], total, page, perPage };

    const saleIds = items.map((s) => s.id);
    const cashierIds = [...new Set(items.map((s) => s.cashierId))];
    const customerIds = [...new Set(items.map((s) => s.customerId).filter((id): id is string => Boolean(id)))];
    const [paymentRows, employeeDocs, customerDocs, merchant] = await Promise.all([
      this.payments.find({ saleId: { $in: saleIds } }),
      this.employees.find({ _id: { $in: cashierIds } }).select({ name: 1 }),
      this.customers.find({ _id: { $in: customerIds } }).select({ firstName: 1, lastName: 1, phone: 1 }),
      this.settings.getCompany(),
    ]);
    const nameByCashier = new Map(employeeDocs.map((e) => [e.id, e.name]));
    const customerById = new Map(customerDocs.map((customer) => [customer.id, customer]));
    const paymentsBySale = new Map<string, typeof paymentRows>();
    for (const p of paymentRows) {
      const list = paymentsBySale.get(p.saleId) ?? [];
      list.push(p);
      paymentsBySale.set(p.saleId, list);
    }

    const contracts = items.map((doc) => this.toContractSync(
      doc,
      nameByCashier.get(doc.cashierId) ?? '',
      paymentsBySale.get(doc.id) ?? [],
      doc.customerId ? customerById.get(doc.customerId) : undefined,
      merchant,
    ));
    return { items: contracts, total, page, perPage };
  }

  async toContract(doc: PosSaleDocument, cashierName: string): Promise<PosSaleContract> {
    const [paymentRows, customer, merchant] = await Promise.all([
      this.payments.find({ saleId: doc.id }),
      doc.customerId ? this.customers.findById(doc.customerId).select({ firstName: 1, lastName: 1, phone: 1 }) : null,
      this.settings.getCompany(),
    ]);
    return this.toContractSync(doc, cashierName, paymentRows, customer ?? undefined, merchant);
  }

  private toContractSync(
    doc: PosSaleDocument,
    cashierName: string,
    paymentRows: PosPayment[],
    customer: Pick<Customer, 'firstName' | 'lastName' | 'phone'> | undefined,
    merchant: Awaited<ReturnType<SettingsService['getCompany']>>,
  ): PosSaleContract {
    return {
      id: doc.id,
      saleNumber: doc.saleNumber,
      terminalId: doc.terminalId,
      registerId: doc.registerId,
      cashierId: doc.cashierId,
      cashierName,
      sessionId: doc.sessionId,
      locationId: doc.locationId,
      status: doc.status,
      lines: doc.lines,
      customerId: doc.customerId,
      customerName: customer ? `${customer.firstName} ${customer.lastName}`.trim() || null : null,
      customerPhone: customer?.phone ?? null,
      merchant: {
        legalName: merchant.legalName,
        address: merchant.address,
        phone: merchant.phone,
        matriculeFiscal: merchant.matriculeFiscal,
        rcNumber: merchant.rcNumber,
      },
      subtotalMinor: doc.subtotalMinor,
      discountMinor: doc.discountMinor,
      totalMinor: doc.totalMinor,
      paymentMethod: doc.paymentMethod,
      payments: paymentRows.map((p) => ({ method: p.method === 'MIXED_COMPONENT' ? 'OTHER' : p.method, amountMinor: p.amountMinor })),
      cashReceivedMinor: doc.cashReceivedMinor,
      loyaltyPointsEarned: doc.loyaltyPointsEarned,
      loyaltyPointsRedeemed: doc.loyaltyPointsRedeemed,
      loyaltyDiscountMinor: doc.loyaltyDiscountMinor,
      notes: doc.notes,
      changeMinor: doc.changeMinor,
      createdAt: doc.createdAt.toISOString(),
      completedAt: doc.completedAt ? doc.completedAt.toISOString() : null,
      printStatus: doc.printStatus,
      printedAt: doc.printedAt ? doc.printedAt.toISOString() : null,
    };
  }

  /** Records the outcome of a receipt-print attempt against the local
   *  hardware bridge. Never touches sale status/stock/payment — a failed
   *  print is purely a "please retry printing" state, not a failed sale. */
  async setPrintStatus(id: string, status: PosPrintStatus): Promise<{ printStatus: PosPrintStatus; printedAt: string | null }> {
    const doc = await this.sales.findById(id);
    if (!doc) throw new NotFoundException('Vente introuvable');
    doc.printStatus = status;
    doc.printedAt = status === 'printed' ? new Date() : doc.printedAt;
    await doc.save();
    return { printStatus: doc.printStatus, printedAt: doc.printedAt ? doc.printedAt.toISOString() : null };
  }

  async cancel(id: string, actor: { type: 'employee'; id: string; name: string }): Promise<PosSaleDocument> {
    return withOptionalTxn(this.connection, async (txn) => {
      const doc = await this.sales.findById(id).session(txn ?? null);
      if (!doc) throw new NotFoundException('Vente introuvable');
      if (doc.status === 'CANCELLED') return doc;
      if (doc.status !== 'COMPLETED') throw new BadRequestException('Vente non remboursable');
      const cashSession = await this.sessions.requireOpen(doc.sessionId);
      const rows = await this.payments.find({ saleId: id, status: 'PAID' }).session(txn ?? null);
      const cash = sumByMethod(rows, 'CASH');
      const card = sumByMethod(rows, 'CARD');
      const other = rows.reduce((sum, row) => sum + (row.method !== 'CASH' && row.method !== 'CARD' ? row.amountMinor : 0), 0);
      const result = await this.sales.db.model('PosCashierSession').updateOne({ _id: doc.sessionId, status: 'OPEN' }, {
        $inc: { refundsMinor: doc.totalMinor, cashRefundsMinor: cash, cardRefundsMinor: card, otherRefundsMinor: other },
      }, { session: txn });
      if (!result.matchedCount) throw new ConflictException('Cette session est fermée');
      for (const line of doc.stockTracked === false ? [] : doc.lines) {
        await this.ledger.applyMovement({ variantId: line.variantId, locationId: doc.locationId, type: 'correction', onHandDelta: line.qty, reference: doc.id, reason: `Annulation vente #${doc.saleNumber}`, actor, session: txn });
      }
      if (cash) await this.sessions.recordMovement(cashSession, 'CASH_REFUND', cash, actor.id, `Annulation vente #${doc.saleNumber}`, txn, doc.id, `refund:${doc.id}`);
      await this.payments.updateMany({ saleId: id, status: 'PAID' }, { $set: { status: 'REFUNDED' } }, { session: txn });
      if (doc.customerId && (doc.loyaltyPointsEarned || doc.loyaltyPointsRedeemed)) {
        const account = await this.loyalty.getByCustomerId(doc.customerId);
        if (account) {
          if (doc.loyaltyPointsRedeemed) await this.loyaltyLedger.apply({ accountId: account.id, type: 'REFUND_REVERSAL', pointsDelta: doc.loyaltyPointsRedeemed, sourceType: 'REFUND', sourceId: doc.id, session: txn });
          await this.loyaltyLedger.reverseEarnedPoints(account.id, doc.loyaltyPointsEarned, doc.id, txn);
        }
      }
      doc.status = 'CANCELLED';
      await doc.save({ session: txn });
      return doc;
    });
  }
}

function mapLegacyMethod(method: PosSalePaymentInput['method']): 'CASH' | 'CARD' | 'OTHER' {
  return method === 'CASH' || method === 'CARD' ? method : 'OTHER';
}

/** Runs `fn` in a transaction when the connection supports it, otherwise plain. */
async function withOptionalTxn<T>(connection: Connection, fn: (session?: ClientSession) => Promise<T>): Promise<T> {
  const session = await connection.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
