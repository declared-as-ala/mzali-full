import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Category } from '@/catalog/category.schema';
import { Product } from '@/catalog/product.schema';
import { Variant } from '@/catalog/variant.schema';
import { toDinars } from '@/common/money';
import { normalizePublicMediaUrl } from '@/common/public-media-url';
import { LoyaltyAccount } from '@/loyalty/loyalty-account.schema';
import { LoyaltyCard } from '@/loyalty/loyalty-card.schema';
import { LoyaltyTransaction } from '@/loyalty/loyalty-transaction.schema';
import { StockItem } from '@/inventory/stock-item.schema';
import { COMMIT_STATUSES } from '@/orders/order-status';
import { Order } from '@/orders/order.schema';
import { PurchaseOrder } from '@/purchase-orders/purchase-order.schema';
import { Employee } from '@/users/employee.schema';
import { PosCashierSession } from './pos-cashier-session.schema';
import { PosCashMovement } from './pos-cash-movement.schema';
import { PosLostSale } from './pos-lost-sale.schema';
import { PosPayment } from './pos-payment.schema';
import { PosSale } from './pos-sale.schema';

const TZ = 'Africa/Tunis';
const OPEN_PO_STATUSES = ['SUBMITTED', 'CONFIRMED_BY_SUPPLIER', 'PARTIALLY_RECEIVED'];

export type PosAnalyticsFilter = {
  from: Date;
  to: Date;
  locationId?: string;
  terminalId?: string;
  registerId?: string;
  cashierId?: string;
};

/** Which sales feed a cross-channel report — 'pos' = boutique till sales
 *  only, 'online' = confirmed web orders only, 'all' = both merged. */
export type SalesChannel = 'pos' | 'online' | 'all';

export type ProductPerformanceSort = 'qty' | 'revenue' | 'profit' | 'margin' | 'growth';

type RawProductRow = {
  variantId: string | null;
  productId: string;
  name: string;
  sku: string | null;
  qty: number;
  revenue: number;
  discounts: number;
  txnIds: Set<string>;
};

function orderMatch(filter: PosAnalyticsFilter): Record<string, unknown> {
  // Only orders whose status is in the stock-commit bucket represent a real
  // completed sale (the same rule that actually deducts Depot stock) —
  // pending/draft/cancelled orders never reach this state, so this already
  // satisfies "exclude pending orders / cancelled orders" for the online
  // channel without a separate status list to maintain.
  return { createdAt: { $gte: filter.from, $lte: filter.to }, status: { $in: [...COMMIT_STATUSES] } };
}

function saleMatch(filter: PosAnalyticsFilter): Record<string, unknown> {
  const match: Record<string, unknown> = {
    status: 'COMPLETED',
    createdAt: { $gte: filter.from, $lte: filter.to },
  };
  if (filter.locationId) match.locationId = filter.locationId;
  if (filter.terminalId) match.terminalId = filter.terminalId;
  if (filter.registerId) match.registerId = filter.registerId;
  if (filter.cashierId) match.cashierId = filter.cashierId;
  return match;
}

function previousPeriod(filter: PosAnalyticsFilter): PosAnalyticsFilter {
  const spanMs = filter.to.getTime() - filter.from.getTime();
  return { ...filter, from: new Date(filter.from.getTime() - spanMs), to: new Date(filter.from.getTime()) };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

@Injectable()
export class PosAnalyticsService {
  constructor(
    @InjectModel(PosSale.name) private readonly sales: Model<PosSale>,
    @InjectModel(PosPayment.name) private readonly payments: Model<PosPayment>,
    @InjectModel(PosCashMovement.name) private readonly cashMovements: Model<PosCashMovement>,
    @InjectModel(PosCashierSession.name) private readonly sessions: Model<PosCashierSession>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectModel(Variant.name) private readonly variants: Model<Variant>,
    @InjectModel(Category.name) private readonly categories: Model<Category>,
    @InjectModel(StockItem.name) private readonly stockItems: Model<StockItem>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(PurchaseOrder.name) private readonly purchaseOrders: Model<PurchaseOrder>,
    @InjectModel(PosLostSale.name) private readonly lostSaleAttempts: Model<PosLostSale>,
    @InjectModel(Employee.name) private readonly employees: Model<Employee>,
    @InjectModel(LoyaltyAccount.name) private readonly loyaltyAccounts: Model<LoyaltyAccount>,
    @InjectModel(LoyaltyCard.name) private readonly loyaltyCards: Model<LoyaltyCard>,
    @InjectModel(LoyaltyTransaction.name) private readonly loyaltyTransactions: Model<LoyaltyTransaction>,
  ) {}

  // ---- KPIs ----------------------------------------------------

  async kpis(filter: PosAnalyticsFilter) {
    const [current, previous, openSessions, cashDiffAgg] = await Promise.all([
      this.kpiRaw(filter),
      this.kpiRaw(previousPeriod(filter)),
      this.sessions.countDocuments({ status: 'OPEN' }),
      this.closedSessionsCashDifference(filter),
    ]);

    const build = (label: string, curVal: number, prevVal: number, formatDinars = true) => ({
      label,
      value: formatDinars ? toDinars(curVal) : curVal,
      previousValue: formatDinars ? toDinars(prevVal) : prevVal,
      changePercent: pctChange(curVal, prevVal),
    });

    return {
      grossRevenue: build('Chiffre d\'affaires brut', current.grossMinor, previous.grossMinor),
      netRevenue: build('Chiffre d\'affaires net', current.netMinor, previous.netMinor),
      totalDiscounts: build('Remises totales', current.discountMinor, previous.discountMinor),
      totalRefunds: build('Remboursements', 0, 0), // no refund flow exists yet — see progress.md
      completedTickets: build('Tickets complétés', current.ticketCount, previous.ticketCount, false),
      cancelledSales: build('Ventes annulées', 0, 0, false), // no cancel flow exists yet
      refundedTickets: build('Tickets remboursés', 0, 0, false),
      productsSold: build('Articles vendus', current.itemsSold, previous.itemsSold, false),
      uniqueCustomers: build('Clients uniques', current.uniqueCustomers, previous.uniqueCustomers, false),
      averageBasket: build('Panier moyen', current.avgBasketMinor, previous.avgBasketMinor),
      averageArticlesPerTicket: build('Articles / ticket', current.avgArticles, previous.avgArticles, false),
      cashRevenue: build('Ventes en espèces', current.cashMinor, previous.cashMinor),
      cardRevenue: build('Ventes par carte', current.cardMinor, previous.cardMinor),
      mixedRevenue: build('Ventes mixtes', current.mixedMinor, previous.mixedMinor),
      loyaltyPointsEarned: build('Points fidélité gagnés', current.pointsEarned, previous.pointsEarned, false),
      loyaltyPointsRedeemed: build('Points fidélité échangés', current.pointsRedeemed, previous.pointsRedeemed, false),
      openSessions: { label: 'Sessions ouvertes', value: openSessions },
      cashDifference: { label: 'Écart de caisse (sessions fermées)', value: toDinars(cashDiffAgg) },
      taxTotal: { label: 'Taxes', value: null, note: 'Non applicable — la TVA n\'est pas calculée sur les ventes boutique' },
    };
  }

  /** Public (not private) so pos-dashboard.service.ts can reuse this exact
   *  aggregation for the POS terminal's own "today" summary instead of
   *  duplicating the pipeline — see kpis() above for the admin-report shape
   *  built from the same raw numbers. */
  async kpiRaw(filter: PosAnalyticsFilter) {
    const [agg] = await this.sales.aggregate<{
      grossMinor: number; discountMinor: number; ticketCount: number; itemsSold: number;
      cashMinor: number; cardMinor: number; mixedMinor: number;
      pointsEarned: number; pointsRedeemed: number; customerIds: string[];
    }>([
      { $match: saleMatch(filter) },
      {
        $group: {
          _id: null,
          grossMinor: { $sum: '$totalMinor' },
          discountMinor: { $sum: '$discountMinor' },
          ticketCount: { $sum: 1 },
          itemsSold: { $sum: { $sum: '$lines.qty' } },
          cashMinor: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'CASH'] }, '$totalMinor', 0] } },
          cardMinor: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'CARD'] }, '$totalMinor', 0] } },
          mixedMinor: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'MIXED'] }, '$totalMinor', 0] } },
          pointsEarned: { $sum: '$loyaltyPointsEarned' },
          pointsRedeemed: { $sum: '$loyaltyPointsRedeemed' },
          customerIds: { $addToSet: '$customerId' },
        },
      },
    ]);
    const grossMinor = agg?.grossMinor ?? 0;
    const ticketCount = agg?.ticketCount ?? 0;
    const itemsSold = agg?.itemsSold ?? 0;
    const uniqueCustomers = agg ? agg.customerIds.filter(Boolean).length : 0;
    return {
      grossMinor,
      netMinor: grossMinor, // no refunds exist yet to subtract — net === gross for now
      discountMinor: agg?.discountMinor ?? 0,
      ticketCount,
      itemsSold,
      uniqueCustomers,
      avgBasketMinor: ticketCount > 0 ? Math.round(grossMinor / ticketCount) : 0,
      avgArticles: ticketCount > 0 ? Math.round((itemsSold / ticketCount) * 10) / 10 : 0,
      cashMinor: agg?.cashMinor ?? 0,
      cardMinor: agg?.cardMinor ?? 0,
      mixedMinor: agg?.mixedMinor ?? 0,
      pointsEarned: agg?.pointsEarned ?? 0,
      pointsRedeemed: agg?.pointsRedeemed ?? 0,
    };
  }

  private async closedSessionsCashDifference(filter: PosAnalyticsFilter): Promise<number> {
    const sessionMatch: Record<string, unknown> = {
      status: 'CLOSED',
      closedAt: { $gte: filter.from, $lte: filter.to },
    };
    if (filter.terminalId) sessionMatch.terminalId = filter.terminalId;
    if (filter.cashierId) sessionMatch.cashierId = filter.cashierId;
    const closedSessions = await this.sessions.find(sessionMatch);
    let total = 0;
    for (const s of closedSessions) {
      const zReport = s.reports.find((r) => r.type === 'Z');
      if (zReport?.cashDifferenceMinor != null) total += zReport.cashDifferenceMinor;
    }
    return total;
  }

  /** Estimated gross margin over the period. Cost basis is the admin-entered
   *  `variants.purchasePriceMinor` (see product form's "Prix d'achat") —
   *  falling back to the legacy `averageCostMinor`/`lastPurchaseCostMinor`
   *  fields for variants that predate that field and haven't been migrated
   *  yet (see migrate:purchase-prices). Never `stock_items.averageCostMinor`,
   *  which the now-retired goods-receipt workflow never actually wrote. */
  private async variantCostMap(variantIds: string[]): Promise<Map<string, number>> {
    const docs = await this.variants
      .find({ _id: { $in: variantIds } })
      .select({ purchasePriceMinor: 1, averageCostMinor: 1, lastPurchaseCostMinor: 1 });
    const byVariant = new Map<string, number>();
    for (const doc of docs) {
      const cost = doc.purchasePriceMinor ?? doc.averageCostMinor ?? doc.lastPurchaseCostMinor;
      if (cost != null) byVariant.set(doc.id, cost);
    }
    return byVariant;
  }

  async marginEstimate(filter: PosAnalyticsFilter) {
    const rows = await this.sales.aggregate<{ variantId: string; qty: number; revenue: number }>([
      { $match: saleMatch(filter) },
      { $unwind: '$lines' },
      { $group: { _id: '$lines.variantId', qty: { $sum: '$lines.qty' }, revenue: { $sum: '$lines.lineTotalMinor' } } },
      { $project: { _id: 0, variantId: '$_id', qty: 1, revenue: 1 } },
    ]);
    if (!rows.length) return { revenue: 0, cost: null, margin: null, marginPercent: null, costUnknown: true };

    const variantIds = rows.map((r) => r.variantId);
    const costByVariant = await this.variantCostMap(variantIds);

    let revenue = 0;
    let cost = 0;
    let costUnknown = false;
    for (const row of rows) {
      revenue += row.revenue;
      const unitCost = costByVariant.get(row.variantId);
      if (unitCost === undefined) { costUnknown = true; continue; }
      cost += unitCost * row.qty;
    }
    return {
      revenue: toDinars(revenue),
      cost: costUnknown ? null : toDinars(cost),
      margin: costUnknown ? null : toDinars(revenue - cost),
      marginPercent: costUnknown || revenue === 0 ? null : Math.round(((revenue - cost) / revenue) * 1000) / 10,
      costUnknown,
    };
  }

  // ---- revenue series (auto-granularity) ----------------------------------------------------

  async revenueSeries(filter: PosAnalyticsFilter, requestedGranularity?: 'hour' | 'day' | 'week' | 'month') {
    const spanDays = (filter.to.getTime() - filter.from.getTime()) / 86_400_000;
    const granularity = requestedGranularity ?? (spanDays <= 1.5 ? 'hour' : spanDays <= 60 ? 'day' : spanDays <= 400 ? 'week' : 'month');

    const dateFormat = granularity === 'hour' ? '%Y-%m-%dT%H:00' : granularity === 'week' ? '%G-W%V' : granularity === 'month' ? '%Y-%m' : '%Y-%m-%d';
    const rows = await this.sales.aggregate<{ _id: string; revenue: number; discounts: number; tickets: number; qty: number }>([
      { $match: saleMatch(filter) },
      {
        $group: {
          _id: { $dateToString: { date: '$createdAt', format: dateFormat, timezone: TZ } },
          revenue: { $sum: '$totalMinor' },
          discounts: { $sum: '$discountMinor' },
          tickets: { $sum: 1 },
          qty: { $sum: { $sum: '$lines.qty' } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return {
      granularity,
      points: rows.map((r) => ({
        bucket: r._id,
        revenue: toDinars(r.revenue),
        discounts: toDinars(r.discounts),
        tickets: r.tickets,
        averageBasket: r.tickets > 0 ? toDinars(Math.round(r.revenue / r.tickets)) : 0,
      })),
    };
  }

  // ---- payment breakdown ----------------------------------------------------

  async paymentBreakdown(filter: PosAnalyticsFilter) {
    const saleIds = await this.sales.find(saleMatch(filter)).select({ _id: 1 });
    const ids = saleIds.map((s) => s.id);
    if (!ids.length) return [];
    const rows = await this.payments.aggregate<{ _id: string; total: number; count: number }>([
      { $match: { saleId: { $in: ids }, status: 'PAID' } },
      { $group: { _id: '$method', total: { $sum: '$amountMinor' }, count: { $sum: 1 } } },
    ]);
    const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);
    return rows.map((r) => ({
      method: r._id,
      total: toDinars(r.total),
      count: r.count,
      percentOfRevenue: grandTotal > 0 ? Math.round((r.total / grandTotal) * 1000) / 10 : 0,
      averageValue: r.count > 0 ? toDinars(Math.round(r.total / r.count)) : 0,
      refundTotal: 0, // no refund flow exists yet
    }));
  }

  // ---- cashier performance ----------------------------------------------------

  async cashierPerformance(filter: PosAnalyticsFilter) {
    const rows = await this.sales.aggregate<{
      _id: string; ticketCount: number; grossMinor: number; discountMinor: number; itemsSold: number;
      lastSaleAt: Date;
    }>([
      { $match: saleMatch(filter) },
      {
        $group: {
          _id: '$cashierId',
          ticketCount: { $sum: 1 },
          grossMinor: { $sum: '$totalMinor' },
          discountMinor: { $sum: '$discountMinor' },
          itemsSold: { $sum: { $sum: '$lines.qty' } },
          lastSaleAt: { $max: '$createdAt' },
        },
      },
      { $sort: { grossMinor: -1 } },
    ]);
    if (!rows.length) return [];

    const cashierIds = rows.map((r) => r._id);
    const [employeeDocs, sessionAgg] = await Promise.all([
      this.employees.find({ _id: { $in: cashierIds } }).select({ name: 1 }),
      this.sessions.aggregate<{ _id: string; sessionCount: number; cashDifference: number; totalDurationMs: number; closedCount: number }>([
        { $match: { cashierId: { $in: cashierIds }, openedAt: { $lte: filter.to }, $or: [{ closedAt: { $gte: filter.from } }, { closedAt: null }] } },
        {
          $project: {
            cashierId: 1,
            durationMs: { $subtract: [{ $ifNull: ['$closedAt', new Date()] }, '$openedAt'] },
            closed: { $eq: ['$status', 'CLOSED'] },
            cashDiff: {
              $let: {
                vars: { z: { $arrayElemAt: [{ $filter: { input: '$reports', cond: { $eq: ['$$this.type', 'Z'] } } }, 0] } },
                in: { $ifNull: ['$$z.cashDifferenceMinor', 0] },
              },
            },
          },
        },
        {
          $group: {
            _id: '$cashierId',
            sessionCount: { $sum: 1 },
            cashDifference: { $sum: '$cashDiff' },
            totalDurationMs: { $sum: '$durationMs' },
            closedCount: { $sum: { $cond: ['$closed', 1, 0] } },
          },
        },
      ]),
    ]);
    const nameById = new Map(employeeDocs.map((e) => [e.id, e.name]));
    const sessionById = new Map(sessionAgg.map((s) => [s._id, s]));

    return rows.map((r) => {
      const s = sessionById.get(r._id);
      return {
        cashierId: r._id,
        cashierName: nameById.get(r._id) ?? r._id,
        sessionCount: s?.sessionCount ?? 0,
        ticketCount: r.ticketCount,
        grossRevenue: toDinars(r.grossMinor),
        netRevenue: toDinars(r.grossMinor), // no refunds to subtract yet
        averageBasket: r.ticketCount > 0 ? toDinars(Math.round(r.grossMinor / r.ticketCount)) : 0,
        itemsSold: r.itemsSold,
        discountsGranted: toDinars(r.discountMinor),
        refundsProcessed: 0,
        cancelledSales: 0,
        manualPriceOverrides: 0,
        cashDrawerManualOpenings: 0,
        cashDifference: toDinars(s?.cashDifference ?? 0),
        averageSessionDurationMinutes: s && s.closedCount > 0 ? Math.round(s.totalDurationMs / s.closedCount / 60000) : null,
        lastActivityAt: r.lastSaleAt.toISOString(),
      };
    });
  }

  /** Full drill-down for one cashier — every session/sale/cash movement in
   *  the period, plus relevant audit events, for accountability review
   *  (not a leaderboard). */
  async cashierDetail(cashierId: string, filter: PosAnalyticsFilter) {
    const match = saleMatch({ ...filter, cashierId });
    const [sales, sessionDocs, cashMovementRows] = await Promise.all([
      this.sales.find(match).sort({ createdAt: -1 }).limit(500),
      this.sessions.find({ cashierId, openedAt: { $lte: filter.to }, $or: [{ closedAt: { $gte: filter.from } }, { closedAt: null }] }).sort({ openedAt: -1 }),
      this.cashMovements.find({ sessionId: { $in: (await this.sessions.find({ cashierId }).select({ _id: 1 })).map((s) => s.id) }, createdAt: { $gte: filter.from, $lte: filter.to } }).sort({ createdAt: -1 }),
    ]);
    return { sales, sessions: sessionDocs, cashMovements: cashMovementRows };
  }

  // ---- cross-channel top products / categories ----------------------------------------------------
  // Single shared row builder feeds both topProducts() and topCategories()
  // so the two reports can never drift apart on cost basis, channel
  // filtering, or the "coût inconnu" rule — see the class-level note on
  // marginEstimate() for why cost must come from Variant, not StockItem.

  private async rawPosProductRows(filter: PosAnalyticsFilter): Promise<RawProductRow[]> {
    const rows = await this.sales.aggregate<{
      _id: { variantId: string | null; productId: string }; name: string; sku: string | null;
      qty: number; revenue: number; discounts: number; saleIds: unknown[];
    }>([
      { $match: saleMatch(filter) },
      { $unwind: '$lines' },
      {
        $group: {
          _id: { variantId: '$lines.variantId', productId: '$lines.productId' },
          name: { $first: '$lines.descriptionSnapshot' },
          sku: { $first: '$lines.sku' },
          qty: { $sum: '$lines.qty' },
          revenue: { $sum: '$lines.lineTotalMinor' },
          discounts: { $sum: '$lines.discountMinor' },
          saleIds: { $addToSet: '$_id' },
        },
      },
    ]);
    return rows.map((r) => ({
      variantId: r._id.variantId ?? null,
      productId: r._id.productId,
      name: r.name,
      sku: r.sku ?? null,
      qty: r.qty,
      revenue: r.revenue,
      discounts: r.discounts,
      txnIds: new Set(r.saleIds.map(String)),
    }));
  }

  /** Online channel — only orders in the stock-commit bucket (orderMatch)
   *  count, so cancelled/pending online orders are already excluded before
   *  this even runs. `variantId` on older order lines can be null (backfill
   *  gap); resolved via the product's single variant (today's 1:1 rule —
   *  see variant.schema.ts decision D7) rather than dropped. */
  private async rawOnlineProductRows(filter: PosAnalyticsFilter): Promise<RawProductRow[]> {
    const rows = await this.orders.aggregate<{
      _id: { variantId: string | null; productId: string }; name: string;
      qty: number; revenue: number; orderIds: unknown[];
    }>([
      { $match: orderMatch(filter) },
      { $unwind: '$items' },
      {
        $group: {
          _id: { variantId: '$items.variantId', productId: '$items.productId' },
          name: { $first: '$items.name' },
          qty: { $sum: '$items.qty' },
          revenue: { $sum: '$items.totalMinor' },
          orderIds: { $addToSet: '$_id' },
        },
      },
    ]);
    const missingProductIds = [...new Set(rows.filter((r) => !r._id.variantId).map((r) => r._id.productId))];
    const resolvedByProduct = new Map<string, string>();
    if (missingProductIds.length) {
      const variantDocs = await this.variants.find({ productId: { $in: missingProductIds } }).select({ productId: 1 });
      for (const v of variantDocs) if (!resolvedByProduct.has(v.productId)) resolvedByProduct.set(v.productId, v.id);
    }
    return rows.map((r) => ({
      variantId: r._id.variantId ?? resolvedByProduct.get(r._id.productId) ?? null,
      productId: r._id.productId,
      name: r.name,
      sku: null,
      qty: r.qty,
      revenue: r.revenue,
      discounts: 0, // order-level discount isn't itemized per line today
      txnIds: new Set(r.orderIds.map(String)),
    }));
  }

  private async rawProductRows(filter: PosAnalyticsFilter, channel: SalesChannel): Promise<RawProductRow[]> {
    const [posRows, onlineRows] = await Promise.all([
      channel === 'online' ? Promise.resolve<RawProductRow[]>([]) : this.rawPosProductRows(filter),
      channel === 'pos' ? Promise.resolve<RawProductRow[]>([]) : this.rawOnlineProductRows(filter),
    ]);
    const merged = new Map<string, RawProductRow>();
    for (const row of [...posRows, ...onlineRows]) {
      const key = row.variantId ?? `product:${row.productId}`;
      const existing = merged.get(key);
      if (existing) {
        existing.qty += row.qty;
        existing.revenue += row.revenue;
        existing.discounts += row.discounts;
        for (const id of row.txnIds) existing.txnIds.add(id);
        if (!existing.sku && row.sku) existing.sku = row.sku;
      } else {
        merged.set(key, row);
      }
    }
    return [...merged.values()];
  }

  /** "Top produits vendus" (+ "Top produits par catégorie" via `categoryId`).
   *  Excludes pending/cancelled/draft on both channels by construction
   *  (saleMatch/orderMatch). Partial-refund subtraction is intentionally
   *  NOT implemented — no refund mechanism exists anywhere in this system
   *  yet (POS or online); see docs/pos-platform/progress.md. */
  async topProducts(filter: PosAnalyticsFilter, opts: {
    channel?: SalesChannel; sort?: ProductPerformanceSort; limit?: number; categoryId?: string;
  } = {}) {
    const channel = opts.channel ?? 'all';
    const limit = opts.limit ?? 20;

    const [currentRows, previousRows] = await Promise.all([
      this.rawProductRows(filter, channel),
      this.rawProductRows(previousPeriod(filter), channel),
    ]);
    if (!currentRows.length) return [];

    const previousByKey = new Map(previousRows.map((r) => [r.variantId ?? `product:${r.productId}`, r]));
    const variantIds = currentRows.map((r) => r.variantId).filter((v): v is string => Boolean(v));
    const productIds = [...new Set(currentRows.map((r) => r.productId))];

    const [variantDocs, productDocs, boutiqueStockDocs, depotStockDocs, incomingRows, costByVariant] = await Promise.all([
      this.variants.find({ _id: { $in: variantIds } }).select({ sku: 1 }),
      this.products.find({ _id: { $in: productIds } }).select({ name: 1, images: 1, categoryIds: 1 }),
      this.stockItems.find({ variantId: { $in: variantIds }, locationId: 'BOUTIQUE' }).select({ variantId: 1, quantityOnHand: 1, quantityReserved: 1 }),
      this.stockItems.find({ variantId: { $in: variantIds }, locationId: 'DEPOT' }).select({ variantId: 1, quantityOnHand: 1, quantityReserved: 1 }),
      this.incomingQtyByVariant(variantIds),
      this.variantCostMap(variantIds),
    ]);
    const variantById = new Map(variantDocs.map((v) => [v.id, v]));
    const productById = new Map(productDocs.map((p) => [p.id, p]));
    const boutiqueByVariant = new Map(boutiqueStockDocs.map((s) => [s.variantId, Math.max(0, s.quantityOnHand - s.quantityReserved)]));
    const depotByVariant = new Map(depotStockDocs.map((s) => [s.variantId, Math.max(0, s.quantityOnHand - s.quantityReserved)]));

    const periodDays = Math.max(1, (filter.to.getTime() - filter.from.getTime()) / 86_400_000);

    let enriched = currentRows.map((row) => {
      const key = row.variantId ?? `product:${row.productId}`;
      const variant = row.variantId ? variantById.get(row.variantId) : undefined;
      const product = productById.get(row.productId);
      const previous = previousByKey.get(key);

      const unitCost = row.variantId ? (costByVariant.get(row.variantId) ?? null) : null;
      const costUnknown = unitCost === null;
      const costMinor = costUnknown ? null : unitCost! * row.qty;
      const profitMinor = costUnknown ? null : row.revenue - costMinor!;
      const marginPercent = costUnknown || row.revenue === 0 ? null : Math.round((profitMinor! / row.revenue) * 1000) / 10;

      const boutiqueStock = row.variantId ? (boutiqueByVariant.get(row.variantId) ?? 0) : 0;
      const depotStock = row.variantId ? (depotByVariant.get(row.variantId) ?? 0) : 0;
      const incomingQty = row.variantId ? (incomingRows.get(row.variantId) ?? 0) : 0;
      const dailyVelocity = row.qty / periodDays;
      const daysOfStockRemaining = dailyVelocity > 0 ? Math.round(((boutiqueStock + depotStock) / dailyVelocity) * 10) / 10 : null;

      return {
        variantId: row.variantId,
        productId: row.productId,
        productName: product?.name ?? row.name,
        sku: variant?.sku ?? row.sku,
        imageUrl: normalizePublicMediaUrl(product?.images?.[0]?.url ?? null),
        categoryIds: product?.categoryIds ?? [],
        quantitySold: row.qty,
        transactionCount: row.txnIds.size,
        revenue: toDinars(row.revenue),
        discounts: toDinars(row.discounts),
        cost: costUnknown ? null : toDinars(costMinor!),
        costUnknown,
        profit: costUnknown ? null : toDinars(profitMinor!),
        marginPercent,
        boutiqueStock,
        depotStock,
        incomingQty,
        averageSellingPrice: row.qty > 0 ? toDinars(Math.round(row.revenue / row.qty)) : 0,
        daysOfStockRemaining,
        trend: {
          quantityChangePercent: pctChange(row.qty, previous?.qty ?? 0),
          revenueChangePercent: pctChange(row.revenue, previous?.revenue ?? 0),
        },
      };
    });

    if (opts.categoryId) enriched = enriched.filter((r) => r.categoryIds.includes(opts.categoryId!));

    const sortKey = opts.sort ?? 'qty';
    enriched.sort((a, b) => {
      if (sortKey === 'revenue') return b.revenue - a.revenue;
      if (sortKey === 'profit') return (b.profit ?? -Infinity) - (a.profit ?? -Infinity);
      if (sortKey === 'margin') return (b.marginPercent ?? -Infinity) - (a.marginPercent ?? -Infinity);
      if (sortKey === 'growth') return (b.trend.revenueChangePercent ?? -Infinity) - (a.trend.revenueChangePercent ?? -Infinity);
      return b.quantitySold - a.quantitySold;
    });

    return enriched.slice(0, limit).map((r, i) => ({ rank: i + 1, ...r }));
  }

  private async incomingQtyByVariant(variantIds: string[]): Promise<Map<string, number>> {
    if (!variantIds.length) return new Map();
    const rows = await this.purchaseOrders.aggregate<{ _id: string; incoming: number }>([
      { $match: { status: { $in: OPEN_PO_STATUSES } } },
      { $unwind: '$lines' },
      { $match: { 'lines.variantId': { $in: variantIds } } },
      { $addFields: { remaining: { $max: [0, { $subtract: ['$lines.orderedQuantity', '$lines.receivedQuantity'] }] } } },
      { $group: { _id: '$lines.variantId', incoming: { $sum: '$remaining' } } },
    ]);
    return new Map(rows.map((r) => [r._id, r.incoming]));
  }

  /** "Catégories les plus performantes" — rolled up from the exact same
   *  rows topProducts() uses, so the two reports can't disagree on totals. */
  async topCategories(filter: PosAnalyticsFilter, channel: SalesChannel = 'all') {
    const rows = await this.rawProductRows(filter, channel);
    if (!rows.length) return [];

    const productIds = [...new Set(rows.map((r) => r.productId))];
    const variantIds = rows.map((r) => r.variantId).filter((v): v is string => Boolean(v));
    const [productDocs, costByVariant, categoryDocs] = await Promise.all([
      this.products.find({ _id: { $in: productIds } }).select({ name: 1, categoryIds: 1 }),
      this.variantCostMap(variantIds),
      this.categories.find().select({ name: 1 }),
    ]);
    const productById = new Map(productDocs.map((p) => [p.id, p]));
    const categoryNameById = new Map(categoryDocs.map((c) => [c.id, c.name]));

    type Bucket = { qty: number; revenue: number; cost: number; costUnknownAny: boolean; products: Map<string, { name: string; qty: number }> };
    const byCategory = new Map<string, Bucket>();
    let grandRevenue = 0;

    for (const row of rows) {
      const product = productById.get(row.productId);
      const categoryIds = product?.categoryIds?.length ? product.categoryIds : ['__uncategorized__'];
      const unitCost = row.variantId ? (costByVariant.get(row.variantId) ?? null) : null;
      grandRevenue += row.revenue;
      for (const categoryId of categoryIds) {
        const bucket = byCategory.get(categoryId) ?? { qty: 0, revenue: 0, cost: 0, costUnknownAny: false, products: new Map() };
        bucket.qty += row.qty;
        bucket.revenue += row.revenue;
        if (unitCost === null) bucket.costUnknownAny = true;
        else bucket.cost += unitCost * row.qty;
        const p = bucket.products.get(row.productId) ?? { name: product?.name ?? row.name, qty: 0 };
        p.qty += row.qty;
        bucket.products.set(row.productId, p);
        byCategory.set(categoryId, bucket);
      }
    }

    return Array.from(byCategory.entries())
      .map(([categoryId, b]) => {
        const bestProduct = [...b.products.values()].sort((x, y) => y.qty - x.qty)[0] ?? null;
        return {
          categoryId,
          categoryName: categoryId === '__uncategorized__' ? 'Sans catégorie' : (categoryNameById.get(categoryId) ?? categoryId),
          quantitySold: b.qty,
          revenue: toDinars(b.revenue),
          cost: b.costUnknownAny ? null : toDinars(b.cost),
          costUnknown: b.costUnknownAny,
          profit: b.costUnknownAny ? null : toDinars(b.revenue - b.cost),
          marginPercent: b.costUnknownAny || b.revenue === 0 ? null : Math.round(((b.revenue - b.cost) / b.revenue) * 1000) / 10,
          percentOfRevenue: grandRevenue > 0 ? Math.round((b.revenue / grandRevenue) * 1000) / 10 : 0,
          bestSellingProduct: bestProduct?.name ?? null,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }

  // ---- loyalty analytics ----------------------------------------------------

  async loyaltyAnalytics(filter: PosAnalyticsFilter) {
    const [salesAgg, cardCounts, accountCount] = await Promise.all([
      this.sales.aggregate<{ _id: null; loyaltySales: number; loyaltySalesCount: number; nonLoyaltySales: number; nonLoyaltySalesCount: number }>([
        { $match: saleMatch(filter) },
        {
          $group: {
            _id: null,
            loyaltySales: { $sum: { $cond: [{ $ne: ['$customerId', null] }, '$totalMinor', 0] } },
            loyaltySalesCount: { $sum: { $cond: [{ $ne: ['$customerId', null] }, 1, 0] } },
            nonLoyaltySales: { $sum: { $cond: [{ $eq: ['$customerId', null] }, '$totalMinor', 0] } },
            nonLoyaltySalesCount: { $sum: { $cond: [{ $eq: ['$customerId', null] }, 1, 0] } },
          },
        },
      ]),
      this.loyaltyCards.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      this.loyaltyAccounts.countDocuments(),
    ]);

    const [pointsAgg, unusedPointsAgg] = await Promise.all([
      this.loyaltyTransactions.aggregate<{ _id: string; total: number }>([
        { $match: { createdAt: { $gte: filter.from, $lte: filter.to }, type: { $in: ['EARN', 'REDEEM'] } } },
        { $group: { _id: '$type', total: { $sum: { $abs: '$pointsDelta' } } } },
      ]),
      this.loyaltyAccounts.aggregate<{ _id: null; totalPoints: number }>([
        { $match: { status: 'ACTIVE' } },
        { $group: { _id: null, totalPoints: { $sum: '$pointsBalance' } } },
      ]),
    ]);

    const s = salesAgg[0];
    return {
      identifiedCustomerSales: s ? toDinars(s.loyaltySales) : 0,
      anonymousSales: s ? toDinars(s.nonLoyaltySales) : 0,
      identifiedTicketCount: s?.loyaltySalesCount ?? 0,
      anonymousTicketCount: s?.nonLoyaltySalesCount ?? 0,
      cardsIssued: cardCounts.reduce((sum, c) => sum + c.count, 0),
      cardsActive: cardCounts.find((c) => c._id === 'ACTIVE')?.count ?? 0,
      cardsSuspended: cardCounts.find((c) => c._id === 'SUSPENDED')?.count ?? 0,
      cardsUnassigned: cardCounts.find((c) => c._id === 'UNASSIGNED')?.count ?? 0,
      totalAccounts: accountCount,
      pointsEarned: pointsAgg.find((p) => p._id === 'EARN')?.total ?? 0,
      pointsRedeemed: pointsAgg.find((p) => p._id === 'REDEEM')?.total ?? 0,
      unusedPointsLiability: unusedPointsAgg[0]?.totalPoints ?? 0,
    };
  }

  // ---- live sessions snapshot (non-SSE, used by the initial page load) ----------------------------------------------------

  async liveSessions() {
    const openSessions = await this.sessions.find({ status: 'OPEN' }).sort({ openedAt: -1 });
    if (!openSessions.length) return [];
    const cashierIds = [...new Set(openSessions.map((s) => s.cashierId))];
    const employeeDocs = await this.employees.find({ _id: { $in: cashierIds } }).select({ name: 1 });
    const nameById = new Map(employeeDocs.map((e) => [e.id, e.name]));
    return openSessions.map((s) => ({
      sessionId: s.id,
      cashierId: s.cashierId,
      cashierName: nameById.get(s.cashierId) ?? s.cashierId,
      terminalId: s.terminalId,
      registerId: s.registerId,
      openedAt: s.openedAt.toISOString(),
      revenue: toDinars(s.grossSalesMinor),
      transactionCount: s.transactionCount,
      cashTotal: toDinars(s.cashSalesMinor),
      cardTotal: toDinars(s.cardSalesMinor),
    }));
  }

  // ---- lost sales (estimate) ----------------------------------------------------

  /** "Ventes perdues" — attempts to sell an out-of-stock item, not
   *  confirmed lost revenue. `estimatedMissedRevenue` is exactly that: an
   *  estimate (attempts × price snapshot at the moment of each attempt),
   *  never presented as a real transaction. */
  async lostSales(filter: PosAnalyticsFilter) {
    const match: Record<string, unknown> = { createdAt: { $gte: filter.from, $lte: filter.to } };
    if (filter.locationId) match.locationId = filter.locationId;
    if (filter.terminalId) match.terminalId = filter.terminalId;
    if (filter.cashierId) match.cashierId = filter.cashierId;

    const rows = await this.lostSaleAttempts.aggregate<{
      _id: string; productId: string; productName: string; attempts: number;
      estimatedMissedRevenueMinor: number; lastAttemptAt: Date; lastCashierId: string;
    }>([
      { $match: match },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$variantId',
          productId: { $first: '$productId' },
          productName: { $first: '$productName' },
          attempts: { $sum: 1 },
          estimatedMissedRevenueMinor: { $sum: '$priceMinorAtAttempt' },
          lastAttemptAt: { $first: '$createdAt' },
          lastCashierId: { $first: '$cashierId' },
        },
      },
      { $sort: { attempts: -1 } },
      { $limit: 50 },
    ]);
    if (!rows.length) return [];

    const variantIds = rows.map((r) => r._id);
    const cashierIds = [...new Set(rows.map((r) => r.lastCashierId))];
    const [boutiqueStockDocs, depotStockDocs, employeeDocs] = await Promise.all([
      this.stockItems.find({ variantId: { $in: variantIds }, locationId: 'BOUTIQUE' }).select({ variantId: 1, quantityOnHand: 1, quantityReserved: 1 }),
      this.stockItems.find({ variantId: { $in: variantIds }, locationId: 'DEPOT' }).select({ variantId: 1, quantityOnHand: 1, quantityReserved: 1 }),
      this.employees.find({ _id: { $in: cashierIds } }).select({ name: 1 }),
    ]);
    const boutiqueByVariant = new Map(boutiqueStockDocs.map((s) => [s.variantId, Math.max(0, s.quantityOnHand - s.quantityReserved)]));
    const depotByVariant = new Map(depotStockDocs.map((s) => [s.variantId, Math.max(0, s.quantityOnHand - s.quantityReserved)]));
    const nameByCashier = new Map(employeeDocs.map((e) => [e.id, e.name]));

    return rows.map((r) => ({
      variantId: r._id,
      productId: r.productId,
      productName: r.productName,
      attempts: r.attempts,
      boutiqueStock: boutiqueByVariant.get(r._id) ?? 0,
      depotStock: depotByVariant.get(r._id) ?? 0,
      estimatedMissedRevenue: toDinars(r.estimatedMissedRevenueMinor),
      lastAttemptAt: r.lastAttemptAt.toISOString(),
      lastCashierName: nameByCashier.get(r.lastCashierId) ?? r.lastCashierId,
    }));
  }
}
