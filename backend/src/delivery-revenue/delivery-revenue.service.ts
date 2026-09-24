import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  AuditActor,
  DeliveryRevenueDayRow,
  DeliveryRevenueOrderRow,
  DeliveryRevenuePreset,
  DeliveryRevenueProviderKey,
  DeliveryRevenueProviderRow,
  DeliveryRevenueSummary,
} from '@contracts';
import { AuditService } from '@/audit/audit.service';
import { Order } from '@/orders/order.schema';
import { rangeToUtcBounds, resolveDeliveryRevenueRange } from './delivery-revenue-date';

const EFFECTIVE_TOTAL = { $ifNull: ['$manualTotalMinor', '$totalMinor'] };
const PROVIDER_KEY = { $ifNull: ['$delivery.provider', 'manual'] };

/**
 * "Chiffre d'affaires commandes" — the ONLY revenue reporting in this
 * codebase driven by carrier-confirmed delivery (`delivery.status ===
 * 'DELIVERED'` + `delivery.deliveredAt` in range), not by admin order
 * status or `createdAt`. Deliberately separate from stats/stats.service.ts's
 * existing revenue numbers (which count on order CONFIRMATION, via
 * `createdAt`) — that's a different, already-shipped KPI this module
 * does not touch or replace.
 *
 * Every method here is a MongoDB aggregation — see #13: with tens of
 * thousands of orders, nothing is ever loaded into memory beyond one
 * page of the drill-down order list.
 */
@Injectable()
export class DeliveryRevenueService {
  constructor(
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    private readonly audit: AuditService,
  ) {}

  resolveRange(preset?: DeliveryRevenuePreset, from?: string, to?: string) {
    return resolveDeliveryRevenueRange(preset, from, to);
  }

  private matchStage(preset?: DeliveryRevenuePreset, from?: string, to?: string) {
    const range = this.resolveRange(preset, from, to);
    const { start, endExclusive } = rangeToUtcBounds(range);
    return { $match: { 'delivery.status': 'DELIVERED', 'delivery.deliveredAt': { $gte: start, $lt: endExclusive } } };
  }

  async summary(preset?: DeliveryRevenuePreset, from?: string, to?: string): Promise<DeliveryRevenueSummary> {
    const rows = await this.orders.aggregate<{
      _id: null;
      grossRevenueMinor: number;
      deliveredCount: number;
      productRevenueMinor: number;
      shippingRevenueMinor: number;
      returnsRevenueMinor: number;
      returnedCount: number;
    }>([
      this.matchStage(preset, from, to),
      {
        $group: {
          _id: null,
          grossRevenueMinor: { $sum: EFFECTIVE_TOTAL },
          deliveredCount: { $sum: 1 },
          productRevenueMinor: { $sum: '$subtotalMinor' },
          shippingRevenueMinor: { $sum: '$shippingMinor' },
          returnsRevenueMinor: { $sum: { $cond: [{ $eq: ['$status', 'retourne'] }, EFFECTIVE_TOTAL, 0] } },
          returnedCount: { $sum: { $cond: [{ $eq: ['$status', 'retourne'] }, 1, 0] } },
        },
      },
    ]);
    const r = rows[0];
    const grossRevenueMinor = r?.grossRevenueMinor ?? 0;
    const deliveredCount = r?.deliveredCount ?? 0;
    const returnsRevenueMinor = r?.returnsRevenueMinor ?? 0;
    return {
      grossRevenueMinor,
      returnsRevenueMinor,
      netRevenueMinor: grossRevenueMinor - returnsRevenueMinor,
      deliveredCount,
      returnedCount: r?.returnedCount ?? 0,
      averageBasketMinor: deliveredCount > 0 ? Math.round(grossRevenueMinor / deliveredCount) : 0,
      productRevenueMinor: r?.productRevenueMinor ?? 0,
      shippingRevenueMinor: r?.shippingRevenueMinor ?? 0,
    };
  }

  async byDay(preset?: DeliveryRevenuePreset, from?: string, to?: string): Promise<DeliveryRevenueDayRow[]> {
    const rows = await this.orders.aggregate<{ _id: string; deliveredCount: number; revenueMinor: number }>([
      this.matchStage(preset, from, to),
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$delivery.deliveredAt', timezone: 'Africa/Tunis' } },
          deliveredCount: { $sum: 1 },
          revenueMinor: { $sum: EFFECTIVE_TOTAL },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    return rows.map((r) => ({ date: r._id, deliveredCount: r.deliveredCount, revenueMinor: r.revenueMinor }));
  }

  async byProvider(preset?: DeliveryRevenuePreset, from?: string, to?: string): Promise<DeliveryRevenueProviderRow[]> {
    const rows = await this.orders.aggregate<{ _id: DeliveryRevenueProviderKey; deliveredCount: number; revenueMinor: number }>([
      this.matchStage(preset, from, to),
      { $group: { _id: PROVIDER_KEY, deliveredCount: { $sum: 1 }, revenueMinor: { $sum: EFFECTIVE_TOTAL } } },
      { $sort: { revenueMinor: -1 } },
    ]);
    return rows.map((r) => ({ provider: r._id, deliveredCount: r.deliveredCount, revenueMinor: r.revenueMinor }));
  }

  async orderList(opts: {
    preset?: DeliveryRevenuePreset; from?: string; to?: string;
    provider?: DeliveryRevenueProviderKey; page?: number; perPage?: number;
  }): Promise<{ items: DeliveryRevenueOrderRow[]; total: number; page: number; perPage: number }> {
    const page = Math.max(1, opts.page ?? 1);
    const perPage = Math.min(200, Math.max(1, opts.perPage ?? 50));
    const range = this.resolveRange(opts.preset, opts.from, opts.to);
    const { start, endExclusive } = rangeToUtcBounds(range);
    const match: Record<string, unknown> = { 'delivery.status': 'DELIVERED', 'delivery.deliveredAt': { $gte: start, $lt: endExclusive } };
    if (opts.provider) match['delivery.provider'] = opts.provider === 'manual' ? null : opts.provider;

    const [docs, total] = await Promise.all([
      this.orders.find(match).sort({ 'delivery.deliveredAt': -1 }).skip((page - 1) * perPage).limit(perPage),
      this.orders.countDocuments(match),
    ]);

    const items: DeliveryRevenueOrderRow[] = docs.map((o) => {
      const provider = (o.delivery.provider ?? 'manual') as DeliveryRevenueProviderKey;
      const tracking = o.delivery.provider ? (o.carrier[o.delivery.provider]?.tracking ?? null) : null;
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: `${o.customer.firstName} ${o.customer.lastName}`.trim(),
        phone: o.customer.phone,
        provider,
        tracking,
        deliveredAt: (o.delivery.deliveredAt as Date).toISOString(),
        totalMinor: o.manualTotalMinor ?? o.totalMinor,
        returned: o.status === 'retourne',
        manual: o.delivery.manual,
      };
    });
    return { items, total, page, perPage };
  }

  /**
   * Admin-only manual delivery confirmation (see #12) — never conflated
   * with a real carrier confirmation: `manual: true` + a required reason
   * + the confirming actor are stored alongside it, and it's audited.
   * Refuses to override an already carrier-confirmed delivery (write-once,
   * same guard the sync job uses).
   */
  async markDelivered(orderId: string, reason: string, actor: AuditActor): Promise<void> {
    if (!reason.trim()) throw new BadRequestException('Un motif est requis pour confirmer une livraison manuellement.');
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundException('Commande introuvable');
    if (order.delivery.status === 'DELIVERED') throw new BadRequestException('Cette commande est déjà marquée comme livrée.');

    const now = new Date();
    order.delivery.status = 'DELIVERED';
    order.delivery.deliveredAt = now;
    order.delivery.provider = null;
    order.delivery.manual = true;
    order.delivery.manualReason = reason.trim();
    order.delivery.manualBy = actor;
    order.delivery.lastCheckedAt = now;
    await order.save();

    await this.audit.log({
      actor,
      action: 'delivery.manual_confirm',
      entityType: 'order',
      entityId: orderId,
      summary: `Livraison confirmée manuellement pour la commande #${order.orderNumber}`,
      after: { reason: reason.trim(), deliveredAt: now.toISOString() },
      ip: null,
    });
  }
}
