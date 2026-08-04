import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  CarrierPerformance,
  CouponPerformance,
  DashboardStats,
  DiscountReportRow,
  GeographyPerformance,
  MarginReportRow,
  PosCashierPerformance,
  PosDailyPoint,
  RevenueSeriesPoint,
  StatusFunnelPoint,
} from '@contracts';
import { Category } from '@/catalog/category.schema';
import { Product } from '@/catalog/product.schema';
import { Variant } from '@/catalog/variant.schema';
import { toDinars } from '@/common/money';
import { Coupon, CouponRedemption } from '@/coupons/coupon.schema';
import { Customer } from '@/customers/customer.schema';
import { StockItem } from '@/inventory/stock-item.schema';
import { Order } from '@/orders/order.schema';
import { DRAFT_STATUS } from '@/orders/order-status';
import { PosSale } from '@/pos/pos-sale.schema';
import { Employee } from '@/users/employee.schema';
import { computeMarginRow, extrapolateCost, ORDER_REVENUE_STATUSES } from './margin-calc';
import { orderStatusFunnel, RawRevenueBucket, zeroFillRevenueDays } from './stats-shaping';

const EXCLUDED_STATUSES = [DRAFT_STATUS, 'trash'];
// Revenue only counts orders that were actually confirmed — matches the
// stock-commit semantics in order-status.ts (an order isn't real revenue
// until it's confirmed by phone or completed, not just placed). Single
// source of truth shared with margin-calc.ts's isRevenueOrderStatus.
const REVENUE_STATUSES: readonly string[] = ORDER_REVENUE_STATUSES;
const DAY_MS = 24 * 60 * 60 * 1000;
const CARRIERS = ['navex', 'firstdelivery', 'axess'] as const;

@Injectable()
export class StatsService {
  constructor(
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectModel(Category.name) private readonly categories: Model<Category>,
    @InjectModel(StockItem.name) private readonly stockItems: Model<StockItem>,
    @InjectModel(Employee.name) private readonly employees: Model<Employee>,
    @InjectModel(Customer.name) private readonly customers: Model<Customer>,
    @InjectModel(Coupon.name) private readonly coupons: Model<Coupon>,
    @InjectModel(CouponRedemption.name) private readonly redemptions: Model<CouponRedemption>,
    @InjectModel(PosSale.name) private readonly posSales: Model<PosSale>,
    @InjectModel(Variant.name) private readonly variants: Model<Variant>,
  ) {}

  async dashboard(requestedDays = 30): Promise<DashboardStats> {
    const days = this.normalizeDays(requestedDays);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const last7 = new Date(now.getTime() - 7 * DAY_MS);
    const last30 = new Date(now.getTime() - 30 * DAY_MS);
    const periodStart = new Date(now.getTime() - days * DAY_MS);
    const previousStart = new Date(periodStart.getTime() - days * DAY_MS);
    const baseFilter = { status: { $nin: EXCLUDED_STATUSES } };
    const revenueFilter = { status: { $in: REVENUE_STATUSES } };
    const periodFilter = { ...baseFilter, createdAt: { $gte: periodStart, $lte: now } };

    const [
      revenueToday,
      revenue7,
      revenue30,
      periodRevenueMinor,
      previousRevenueMinor,
      statusMixAgg,
      topProductsAgg,
      lowStockAgg,
      ordersToday,
      orders7,
      orders30,
      periodOrders,
      previousOrders,
      newCustomers,
      activeCustomers,
      repeatCustomers,
      cancelledOrders,
      allPeriodOrders,
      abandonedCarts,
      exchangeOrders,
      totalOrders,
    ] = await Promise.all([
      this.revenueBetween(startOfToday, now, revenueFilter),
      this.revenueBetween(last7, now, revenueFilter),
      this.revenueBetween(last30, now, revenueFilter),
      this.revenueBetween(periodStart, now, revenueFilter),
      this.revenueBetween(previousStart, periodStart, revenueFilter),
      this.orders.aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: { $gte: periodStart, $lte: now } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.orders.aggregate<{ _id: string; name: string; quantity: number; revenue: number }>([
        { $match: periodFilter },
        { $unwind: '$items' },
        { $group: { _id: '$items.productId', name: { $first: '$items.name' }, quantity: { $sum: '$items.qty' }, revenue: { $sum: '$items.totalMinor' } } },
        { $sort: { quantity: -1 } },
        { $limit: 7 },
      ]),
      // Per-location — a variant can be low at BOUTIQUE while fine at DEPOT,
      // per master-prompt §19. Effective threshold is whichever of the two
      // configured triggers (lowStockThreshold, reorderPoint) is higher.
      this.stockItems.aggregate<{ productId: string; locationId: string; available: number; threshold: number }>([
        {
          $addFields: {
            available: { $subtract: ['$quantityOnHand', '$quantityReserved'] },
            threshold: {
              $cond: [
                { $gt: ['$lowStockThreshold', null] },
                '$lowStockThreshold',
                { $cond: [{ $gt: ['$reorderPoint', 0] }, '$reorderPoint', 5] },
              ],
            },
          },
        },
        { $match: { $expr: { $lte: ['$available', '$threshold'] } } },
        {
          $lookup: {
            from: 'variants',
            let: { vid: { $toObjectId: '$variantId' } },
            pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$vid'] } } }, { $project: { productId: 1 } }],
            as: 'variant',
          },
        },
        { $unwind: '$variant' },
        { $addFields: { productId: '$variant.productId' } },
        { $sort: { available: 1 } },
        { $limit: 20 },
      ]),
      this.orders.countDocuments({ ...baseFilter, createdAt: { $gte: startOfToday, $lte: now } }),
      this.orders.countDocuments({ ...baseFilter, createdAt: { $gte: last7, $lte: now } }),
      this.orders.countDocuments({ ...baseFilter, createdAt: { $gte: last30, $lte: now } }),
      this.orders.countDocuments(periodFilter),
      this.orders.countDocuments({ ...baseFilter, createdAt: { $gte: previousStart, $lt: periodStart } }),
      this.customers.countDocuments({ firstOrderAt: { $gte: periodStart, $lte: now } }),
      this.customers.countDocuments({ lastOrderAt: { $gte: periodStart, $lte: now } }),
      this.customers.countDocuments({ lastOrderAt: { $gte: periodStart, $lte: now }, ordersCount: { $gt: 1 } }),
      this.orders.countDocuments({ status: { $in: ['annule', 'cancelled'] }, createdAt: { $gte: periodStart, $lte: now } }),
      this.orders.countDocuments({ createdAt: { $gte: periodStart, $lte: now }, status: { $ne: 'trash' } }),
      this.orders.countDocuments({ status: DRAFT_STATUS, createdAt: { $gte: periodStart, $lte: now } }),
      this.orders.countDocuments({ ...periodFilter, exchange: true }),
      this.orders.countDocuments(baseFilter),
    ]);

    const productIds = lowStockAgg.map((item) => item.productId);
    const productDocs = productIds.length
      ? await this.products.find({ _id: { $in: productIds } }).select({ name: 1 })
      : [];
    const productNameById = new Map(productDocs.map((product) => [product.id, product.name]));

    const statusMix = Object.fromEntries(statusMixAgg.map((status) => [status._id, status.count]));
    return {
      revenue: { today: toDinars(revenueToday), last7Days: toDinars(revenue7), last30Days: toDinars(revenue30) },
      orders: { today: ordersToday, last7Days: orders7, last30Days: orders30, total: totalOrders },
      averageOrderValue: periodOrders > 0 ? toDinars(Math.round(periodRevenueMinor / periodOrders)) : 0,
      statusMix,
      topProducts: topProductsAgg.map((product) => ({
        productId: product._id,
        name: product.name,
        quantity: product.quantity,
        revenue: toDinars(product.revenue),
      })),
      lowStock: lowStockAgg.map((item) => ({
        productId: item.productId,
        name: productNameById.get(item.productId) ?? item.productId,
        locationId: item.locationId,
        available: item.available,
        threshold: item.threshold,
      })),
      period: {
        days,
        revenue: toDinars(periodRevenueMinor),
        orders: periodOrders,
        averageOrderValue: periodOrders > 0 ? toDinars(Math.round(periodRevenueMinor / periodOrders)) : 0,
        newCustomers,
        repeatCustomerRate: activeCustomers > 0 ? this.percent(repeatCustomers, activeCustomers) : 0,
        cancelledRate: allPeriodOrders > 0 ? this.percent(cancelledOrders, allPeriodOrders) : 0,
        abandonedCarts,
        exchangeRate: periodOrders > 0 ? this.percent(exchangeOrders, periodOrders) : 0,
      },
      previousPeriod: { revenue: toDinars(previousRevenueMinor), orders: previousOrders },
      generatedAt: now.toISOString(),
    };
  }

  async revenueSeries(requestedDays = 30, requestedGranularity?: string): Promise<RevenueSeriesPoint[]> {
    const days = this.normalizeDays(requestedDays, 365);
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * DAY_MS);
    const rows = await this.orders.aggregate<RawRevenueBucket>([
      { $match: { status: { $in: REVENUE_STATUSES }, createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $dateToString: { date: '$createdAt', format: '%Y-%m-%d', timezone: 'Africa/Tunis' } },
          revenueMinor: { $sum: { $ifNull: ['$manualTotalMinor', '$totalMinor'] } },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', revenueMinor: 1, orders: 1 } },
    ]);
    const daily = zeroFillRevenueDays(rows, start, end);
    const weekly = requestedGranularity === 'week' || days > 90;
    if (!weekly) return daily;
    const result: RevenueSeriesPoint[] = [];
    for (let index = 0; index < daily.length; index += 7) {
      const slice = daily.slice(index, index + 7);
      result.push({
        date: slice[0].date,
        revenue: slice.reduce((sum, point) => sum + point.revenue, 0),
        orders: slice.reduce((sum, point) => sum + point.orders, 0),
      });
    }
    return result;
  }

  async statusFunnel(requestedDays = 30): Promise<StatusFunnelPoint[]> {
    const days = this.normalizeDays(requestedDays, 365);
    const start = new Date(Date.now() - days * DAY_MS);
    const rows = await this.orders.aggregate<{ _id: string; count: number }>([
      { $match: { createdAt: { $gte: start } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    return orderStatusFunnel(Object.fromEntries(rows.map((row) => [row._id, row.count])));
  }

  async carrierPerformance(requestedDays = 30): Promise<CarrierPerformance[]> {
    const days = this.normalizeDays(requestedDays, 365);
    const start = new Date(Date.now() - days * DAY_MS);
    return Promise.all(CARRIERS.map(async (carrier) => {
      const path = `carrier.${carrier}`;
      const [summary] = await this.orders.aggregate<{
        pushed: number;
        sent: number;
        failed: number;
        averagePushMs: number | null;
      }>([
        { $match: { createdAt: { $gte: start }, [path]: { $ne: null } } },
        {
          $group: {
            _id: null,
            pushed: { $sum: 1 },
            sent: { $sum: { $cond: [{ $eq: [`$${path}.status`, 'sent'] }, 1, 0] } },
            failed: { $sum: { $cond: [{ $eq: [`$${path}.status`, 'failed'] }, 1, 0] } },
            averagePushMs: { $avg: { $subtract: [`$${path}.pushedAt`, '$createdAt'] } },
          },
        },
      ]);
      const failures = await this.orders
        .find({ createdAt: { $gte: start }, [`${path}.status`]: 'failed' })
        .sort({ [`${path}.pushedAt`]: -1 })
        .limit(4)
        .select({ orderNumber: 1, [path]: 1 });
      const pushed = summary?.pushed ?? 0;
      return {
        carrier,
        pushed,
        sent: summary?.sent ?? 0,
        failed: summary?.failed ?? 0,
        successRate: pushed > 0 ? this.percent(summary?.sent ?? 0, pushed) : 0,
        averagePushMinutes: summary?.averagePushMs == null ? null : Math.round(summary.averagePushMs / 60000),
        recentFailures: failures.map((order) => {
          const result = order.carrier[carrier];
          return {
            orderId: order.id,
            orderNumber: order.orderNumber,
            error: result?.error ?? null,
            pushedAt: result?.pushedAt?.toISOString() ?? order.createdAt.toISOString(),
          };
        }),
      };
    }));
  }

  async couponPerformance(): Promise<CouponPerformance[]> {
    const rows = await this.redemptions.aggregate<{ _id: string; usageCount: number; totalDiscountMinor: number }>([
      { $group: { _id: '$couponId', usageCount: { $sum: 1 }, totalDiscountMinor: { $sum: '$amountMinor' } } },
      { $sort: { usageCount: -1 } },
    ]);
    if (!rows.length) return [];
    const docs = await this.coupons.find({ _id: { $in: rows.map((row) => row._id) } }).select({ code: 1, usageLimit: 1 });
    const byId = new Map(docs.map((coupon) => [coupon.id, coupon]));
    return rows.map((row) => ({
      couponId: row._id,
      code: byId.get(row._id)?.code ?? row._id,
      usageCount: row.usageCount,
      usageLimit: byId.get(row._id)?.usageLimit ?? null,
      totalDiscount: toDinars(row.totalDiscountMinor),
    }));
  }

  async geography(requestedDays = 30): Promise<GeographyPerformance[]> {
    const days = this.normalizeDays(requestedDays, 365);
    const start = new Date(Date.now() - days * DAY_MS);
    const rows = await this.orders.aggregate<{ _id: string; orders: number; revenueMinor: number }>([
      { $match: { status: { $in: REVENUE_STATUSES }, createdAt: { $gte: start } } },
      { $group: { _id: { $ifNull: ['$customer.city', 'Non renseignée'] }, orders: { $sum: 1 }, revenueMinor: { $sum: { $ifNull: ['$manualTotalMinor', '$totalMinor'] } } } },
      { $sort: { revenueMinor: -1 } },
      { $limit: 12 },
    ]);
    return rows.map((row) => ({ city: row._id || 'Non renseignée', orders: row.orders, revenue: toDinars(row.revenueMinor) }));
  }

  async posDaily(requestedDays = 30): Promise<PosDailyPoint[]> {
    const days = this.normalizeDays(requestedDays, 365);
    const start = new Date(Date.now() - days * DAY_MS);
    const rows = await this.posSales.aggregate<{
      _id: string; revenue: number; discounts: number; count: number;
      cash: number; card: number; other: number;
    }>([
      { $match: { status: 'COMPLETED', createdAt: { $gte: start } } },
      {
        $group: {
          _id: { $dateToString: { date: '$createdAt', format: '%Y-%m-%d', timezone: 'Africa/Tunis' } },
          revenue: { $sum: '$totalMinor' },
          discounts: { $sum: '$discountMinor' },
          count: { $sum: 1 },
          cash: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'CASH'] }, '$totalMinor', 0] } },
          card: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'CARD'] }, '$totalMinor', 0] } },
          other: { $sum: { $cond: [{ $in: ['$paymentMethod', ['OTHER', 'MIXED']] }, '$totalMinor', 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    const byDate = new Map(rows.map((row) => [row._id, row]));
    const points: PosDailyPoint[] = [];
    for (let t = start.getTime(); t <= Date.now(); t += DAY_MS) {
      const date = new Date(t).toISOString().slice(0, 10);
      const row = byDate.get(date);
      points.push({
        date,
        revenue: toDinars(row?.revenue ?? 0),
        discounts: toDinars(row?.discounts ?? 0),
        transactionCount: row?.count ?? 0,
        averageBasket: row && row.count > 0 ? toDinars(Math.round(row.revenue / row.count)) : 0,
        cashRevenue: toDinars(row?.cash ?? 0),
        cardRevenue: toDinars(row?.card ?? 0),
        otherRevenue: toDinars(row?.other ?? 0),
      });
    }
    return points;
  }

  async posByCashier(requestedDays = 30): Promise<PosCashierPerformance[]> {
    const days = this.normalizeDays(requestedDays, 365);
    const start = new Date(Date.now() - days * DAY_MS);
    const rows = await this.posSales.aggregate<{ _id: string; revenue: number; count: number }>([
      { $match: { status: 'COMPLETED', createdAt: { $gte: start } } },
      { $group: { _id: '$cashierId', revenue: { $sum: '$totalMinor' }, count: { $sum: 1 } } },
      { $sort: { revenue: -1 } },
    ]);
    if (!rows.length) return [];
    const employeeDocs = await this.employees.find({ _id: { $in: rows.map((row) => row._id) } }).select({ name: 1 });
    const nameById = new Map(employeeDocs.map((employee) => [employee.id, employee.name]));
    return rows.map((row) => ({
      cashierId: row._id,
      name: nameById.get(row._id) ?? row._id,
      revenue: toDinars(row.revenue),
      transactionCount: row.count,
      averageBasket: row.count > 0 ? toDinars(Math.round(row.revenue / row.count)) : 0,
    }));
  }

  /**
   * Revenue/cost per product, merged across POS + online sales in the
   * window. Cost basis is `stock_items.averageCostMinor` (Sprint 6's
   * weighted-average purchase cost) — a product is `costUnknown` rather
   * than shown with a fake 0 margin if any of its sold variants never had
   * a cost recorded (no goods receipt posted for it yet).
   */
  async marginReport(requestedDays = 30, fromDate?: Date, toDate?: Date, channel: 'all' | 'pos' | 'online' = 'all'): Promise<MarginReportRow[]> {
    let start: Date;
    let end: Date = toDate ?? new Date();

    if (fromDate) {
      start = fromDate;
    } else if (requestedDays === 0 || requestedDays >= 3650) {
      start = new Date(0); // All time
    } else {
      const days = this.normalizeDays(requestedDays, 3650);
      if (days === 1) {
        start = new Date();
        start.setHours(0, 0, 0, 0);
      } else if (days === 2) {
        start = new Date(Date.now() - DAY_MS);
        start.setHours(0, 0, 0, 0);
        end = new Date(Date.now() - DAY_MS);
        end.setHours(23, 59, 59, 999);
      } else {
        start = new Date(Date.now() - days * DAY_MS);
      }
    }

    const dateFilter = { $gte: start, $lte: end };

    // Excludes: pending/draft POS sales (SUSPENDED), cancelled POS sales, refunded
    // POS sales (whole-sale REFUNDED status), pending/cancelled online orders — only
    // completed POS sales and confirmed/completed online orders count as real revenue.
    // Note: neither PosSale nor Order line items track a per-line *partial* refund
    // quantity anywhere in this codebase, so partial refunds can't be subtracted here
    // — only whole-sale REFUNDED exclusion is possible with the data that exists.
    const [posRows, orderRows] = await Promise.all([
      channel === 'online'
        ? Promise.resolve([])
        : this.posSales.aggregate<{ _id: { variantId: string; productId: string }; name: string; quantity: number; revenue: number }>([
            { $match: { status: 'COMPLETED', createdAt: dateFilter } },
            { $unwind: '$lines' },
            {
              $group: {
                _id: { variantId: '$lines.variantId', productId: '$lines.productId' },
                name: { $first: '$lines.descriptionSnapshot' },
                quantity: { $sum: '$lines.qty' },
                revenue: { $sum: '$lines.lineTotalMinor' },
              },
            },
          ]),
      channel === 'pos'
        ? Promise.resolve([])
        : this.orders.aggregate<{ _id: { variantId: string; productId: string }; name: string; quantity: number; revenue: number }>([
            { $match: { status: { $in: REVENUE_STATUSES }, createdAt: dateFilter } },
            { $unwind: '$items' },
            { $match: { 'items.variantId': { $ne: null } } },
            {
              $group: {
                _id: { variantId: '$items.variantId', productId: '$items.productId' },
                name: { $first: '$items.name' },
                quantity: { $sum: '$items.qty' },
                revenue: { $sum: '$items.totalMinor' },
              },
            },
          ]),
    ]);

    const byVariant = new Map<string, { productId: string; name: string; quantity: number; revenue: number; channels: Set<'pos' | 'online'> }>();
    for (const row of posRows) {
      const key = row._id.variantId;
      if (!key) continue;
      const existing = byVariant.get(key);
      if (existing) { existing.quantity += row.quantity; existing.revenue += row.revenue; existing.channels.add('pos'); }
      else byVariant.set(key, { productId: row._id.productId, name: row.name, quantity: row.quantity, revenue: row.revenue, channels: new Set(['pos']) });
    }
    for (const row of orderRows) {
      const key = row._id.variantId;
      if (!key) continue;
      const existing = byVariant.get(key);
      if (existing) { existing.quantity += row.quantity; existing.revenue += row.revenue; existing.channels.add('online'); }
      else byVariant.set(key, { productId: row._id.productId, name: row.name, quantity: row.quantity, revenue: row.revenue, channels: new Set(['online']) });
    }

    const variantIds = [...byVariant.keys()];
    const [stockDocs, variantCostDocs] = await Promise.all([
      variantIds.length ? this.stockItems.find({ variantId: { $in: variantIds } }) : Promise.resolve([]),
      variantIds.length
        ? this.variants.find({ _id: { $in: variantIds } }).select({ purchasePriceMinor: 1 })
        : Promise.resolve([]),
    ]);

    const onHandByVariant = new Map<string, number>();
    for (const doc of stockDocs) {
      onHandByVariant.set(doc.variantId, (onHandByVariant.get(doc.variantId) ?? 0) + (doc.quantityOnHand ?? 0));
    }

    // Single cost source: the admin-entered `variants.purchasePriceMinor` (see
    // product form's "Prix d'achat"). No more average/last-cost dual mode and no
    // more goods-receipt-derived cost — this is the one number the margin report
    // trusts, same as pos-analytics.service.ts's variantCostMap.
    const purchasePriceByVariant = new Map<string, number | null>();
    for (const doc of variantCostDocs) purchasePriceByVariant.set(doc.id, doc.purchasePriceMinor);

    const byProduct = new Map<string, {
      productId: string;
      name: string;
      quantity: number;
      revenue: number;
      cost: number;
      costMissing: boolean;
      channels: Set<'pos' | 'online'>;
    }>();

    for (const [variantId, v] of byVariant) {
      const purchasePriceMinor = purchasePriceByVariant.get(variantId) ?? null;
      const { costMinor: rowCost, missing: rowCostMissing } = extrapolateCost(v.quantity, purchasePriceMinor);

      const existing = byProduct.get(v.productId);
      if (existing) {
        existing.quantity += v.quantity;
        existing.revenue += v.revenue;
        existing.cost += rowCost;
        existing.costMissing = existing.costMissing || rowCostMissing;
        for (const c of v.channels) existing.channels.add(c);
      } else {
        byProduct.set(v.productId, {
          productId: v.productId,
          name: v.name,
          quantity: v.quantity,
          revenue: v.revenue,
          cost: rowCost,
          costMissing: rowCostMissing,
          channels: new Set(v.channels),
        });
      }
    }

    const productIds = Array.from(byProduct.keys());
    const productDocs = productIds.length
      ? await this.products.find({ _id: { $in: productIds } })
      : [];
    const productMap = new Map(productDocs.map((p) => [p.id, p]));

    // categoryIds is a plain string[] snapshot on Product, not a mongoose ref,
    // so there's no populatable `categories` virtual — resolve names by id instead.
    const categoryIds = [...new Set(productDocs.flatMap((p) => p.categoryIds ?? []))];
    const categoryDocs = categoryIds.length
      ? await this.categories.find({ _id: { $in: categoryIds } }).select({ name: 1 })
      : [];
    const categoryNameById = new Map(categoryDocs.map((c) => [c.id, c.name]));

    const variantDocs = variantIds.length
      ? await this.variants.find({ _id: { $in: variantIds } })
      : [];
    const variantMap = new Map(variantDocs.map((v) => [v.productId, v.id]));

    return Array.from(byProduct.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map((p) => {
        const prod = productMap.get(p.productId);
        const variantId = variantMap.get(p.productId) ?? '';
        const purchasePriceMinor = variantId ? purchasePriceByVariant.get(variantId) ?? null : null;
        const categoryName = (prod?.categoryIds?.[0] && categoryNameById.get(prod.categoryIds[0])) ?? 'Sans catégorie';
        const unitSellingPrice = prod ? toDinars(prod.salePriceMinor ?? prod.regularPriceMinor ?? 0) : (p.quantity > 0 ? toDinars(Math.round(p.revenue / p.quantity)) : 0);
        const revenue = toDinars(p.revenue);
        const marginResult = computeMarginRow({ revenueMinor: p.revenue, totalPurchaseCostMinor: p.cost, purchasePriceMissing: p.costMissing });
        const totalPurchaseCost = marginResult.totalPurchaseCostMinor != null ? toDinars(marginResult.totalPurchaseCostMinor) : null;
        const profit = marginResult.profitMinor != null ? toDinars(marginResult.profitMinor) : null;
        const marginPercent = marginResult.marginPercent;
        const channel: 'pos' | 'online' | 'mixed' = p.channels.size > 1 ? 'mixed' : (p.channels.values().next().value ?? 'online');

        return {
          productId: p.productId,
          productName: p.name,
          sku: prod?.sku || `PRD-${p.productId.slice(-5).toUpperCase()}`,
          category: categoryName,
          imageUrl: prod?.images?.[0]?.url ?? null,
          quantitySold: p.quantity,
          sellingPrice: unitSellingPrice,
          purchasePrice: purchasePriceMinor != null ? toDinars(purchasePriceMinor) : null,
          purchasePriceMissing: p.costMissing,
          revenue,
          totalPurchaseCost,
          profit,
          marginPercent,
          currentStock: prod?.stockQuantity ?? (variantId ? onHandByVariant.get(variantId) ?? 0 : 0),
          variantId: variantId || null,
          channel,
        };
      });
  }

  /** Discount totals by channel/day using existing discount data — refund
   *  and return-reason breakdowns are explicitly deferred (no refund/
   *  return flow exists anywhere in the system yet, see progress.md
   *  SPRINT-09; not faked here). */
  async discountReport(requestedDays = 30): Promise<DiscountReportRow[]> {
    const days = this.normalizeDays(requestedDays, 365);
    const start = new Date(Date.now() - days * DAY_MS);

    type Bucket = { _id: string; discountTotal: number; grossTotal: number; count: number };
    const posRows = await this.posSales.aggregate<Bucket>([
      { $match: { status: 'COMPLETED', createdAt: { $gte: start } } },
      {
        $group: {
          _id: { $dateToString: { date: '$createdAt', format: '%Y-%m-%d', timezone: 'Africa/Tunis' } },
          discountTotal: { $sum: '$discountMinor' },
          grossTotal: { $sum: '$subtotalMinor' },
          count: { $sum: 1 },
        },
      },
    ]);
    const orderRows = await this.orders.aggregate<Bucket>([
      { $match: { status: { $in: REVENUE_STATUSES }, createdAt: { $gte: start } } },
      {
        $group: {
          _id: { $dateToString: { date: '$createdAt', format: '%Y-%m-%d', timezone: 'Africa/Tunis' } },
          discountTotal: { $sum: '$discountMinor' },
          grossTotal: { $sum: '$subtotalMinor' },
          count: { $sum: 1 },
        },
      },
    ]);

    const toRows = (rows: Bucket[], channel: 'POS' | 'ONLINE'): DiscountReportRow[] =>
      rows.map((r) => ({
        channel,
        date: r._id,
        discountTotal: toDinars(r.discountTotal),
        grossTotal: toDinars(r.grossTotal),
        discountRate: r.grossTotal > 0 ? Math.round((r.discountTotal / r.grossTotal) * 1000) / 10 : 0,
        transactionCount: r.count,
      }));

    return [...toRows(posRows, 'POS'), ...toRows(orderRows, 'ONLINE')].sort((a, b) => a.date.localeCompare(b.date));
  }

  private normalizeDays(days: number, max = 90): number {
    return Math.min(max, Math.max(1, Number.isFinite(days) ? Math.round(days) : 30));
  }

  private percent(value: number, total: number): number {
    return Math.round((value / total) * 1000) / 10;
  }

  private async revenueBetween(start: Date, end: Date, baseFilter: Record<string, unknown>): Promise<number> {
    const [result] = await this.orders.aggregate<{ total: number }>([
      { $match: { ...baseFilter, createdAt: { $gte: start, $lt: end } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$manualTotalMinor', '$totalMinor'] } } } },
    ]);
    return result?.total ?? 0;
  }
}
