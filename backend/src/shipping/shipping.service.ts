import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { AuditActor } from '@contracts';
import { AuditService } from '@/audit/audit.service';
import { toDinars } from '@/common/money';
import { RedisLockService } from '@/redis/redis-lock.service';
import { Order, OrderDocument } from '@/orders/order.schema';
import { toOrderContract } from '@/orders/order.mapper';
import { AxessService } from './axess.service';
import { FirstDeliveryService } from './first-delivery.service';
import { NavexService } from './navex.service';
import type { CarrierResult } from './navex.service';
import { buildCarrierDesignation } from './shipping-line';

export type CarrierName = 'navex' | 'firstdelivery' | 'axess';

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    private readonly navex: NavexService,
    private readonly firstDelivery: FirstDeliveryService,
    private readonly axess: AxessService,
    private readonly lock: RedisLockService,
    private readonly audit: AuditService,
  ) {}

  isAutoPushLabel(carrier: CarrierName, deliveryCompany: string, label: string): boolean {
    void carrier;
    return deliveryCompany.toLowerCase().includes(label.toLowerCase());
  }

  /**
   * Push an order to a carrier. Idempotent: a second call for the same
   * order+carrier is a no-op once a result has been persisted (guards
   * against duplicate pushes from retries or concurrent requests, replacing
   * the legacy in-memory-only lock in lib/delivery-idempotency.ts).
   */
  async push(
    carrier: CarrierName,
    orderId: string,
    actor: AuditActor,
    force = false,
    localityId?: number,
  ): Promise<{ skipped: boolean; result: CarrierResult }> {
    const existing = await this.orders.findById(orderId);
    if (!existing) throw new NotFoundException('Commande introuvable');
    // Skip idempotency check only when force=false AND the existing result succeeded
    if (!force && existing.carrier[carrier] && existing.carrier[carrier]!.status === 'sent') {
      return { skipped: true, result: this.toCarrierResult(existing.carrier[carrier]!) };
    }

    const release = await this.lock.acquire(`carrier-push:${orderId}:${carrier}`, 15000);
    if (!release) throw new BadRequestException('Un envoi est déjà en cours pour cette commande');
    try {
      const order = await this.orders.findById(orderId);
      if (!order) throw new NotFoundException('Commande introuvable');
      // After lock: also skip if already successfully sent (unless force)
      if (!force && order.carrier[carrier] && order.carrier[carrier]!.status === 'sent') {
        return { skipped: true, result: this.toCarrierResult(order.carrier[carrier]!) };
      }

      const result = await this.dispatch(carrier, order, localityId);
      order.carrier[carrier] = {
        status: result.ok ? 'sent' : 'failed',
        response: typeof result.raw === 'string' ? result.raw : JSON.stringify(result.raw ?? null),
        tracking: result.barcode ?? null,
        error: result.error ?? null,
        pushedAt: new Date(),
      } as NonNullable<Order['carrier']['navex']>;
      await order.save();

      await this.audit.log({
        actor,
        action: 'shipping.push',
        entityType: 'order',
        entityId: orderId,
        summary: `Envoi ${carrier} ${result.ok ? 'réussi' : 'échoué'} pour la commande #${order.orderNumber}`,
        after: { carrier, ok: result.ok, tracking: result.barcode ?? null },
        ip: null,
      });

      return { skipped: false, result };
    } finally {
      await release();
    }
  }

  async orderContract(orderId: string) {
    const order = await this.orders.findById(orderId);
    return order ? toOrderContract(order) : null;
  }

  /**
   * Side-effect-free preview of the First Delivery destination the order
   * would resolve to, for the admin to confirm before sending — never
   * calls the carrier API. Returns the same governorate/delegation/
   * locality breakdown a successful push would use, or the ambiguous
   * candidate list when free-text resolution can't pick one confidently.
   */
  async previewFirstDeliveryLocality(orderId: string) {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundException('Commande introuvable');
    // Prefer the admin-confirmed délégation (Mo3tamadia) when set — an
    // explicit signal that resolves immediately via resolveLocalityDetailed's
    // exact-match priority, instead of falling back to free-text address
    // guessing across the whole governorate.
    const resolution = await this.firstDelivery.previewLocality(
      order.customer.city,
      order.customer.locality || order.customer.city,
      order.customer.address,
    );
    if (resolution.status === 'resolved') {
      return {
        status: 'resolved' as const,
        governorate: resolution.locality.governorate_name,
        delegation: resolution.locality.delegation_name,
        locality: resolution.locality.locality_name,
        localityId: resolution.locality.locality_id,
        address: order.customer.address,
      };
    }
    if (resolution.status === 'ambiguous') {
      return {
        status: 'ambiguous' as const,
        address: order.customer.address,
        candidates: resolution.candidates.map((l) => ({
          localityId: l.locality_id,
          label: `${l.locality_name} — ${l.delegation_name}, ${l.governorate_name}`,
        })),
      };
    }
    return { status: 'not_found' as const, address: order.customer.address };
  }

  /** Distinct délégation ("Mo3tamadia") names for one governorate, from
   *  First Delivery's own live directory — see FirstDeliveryService
   *  .delegationsForGovernorate. Powers the admin's per-Ville Localité picker. */
  async firstDeliveryDelegations(governorate: string): Promise<string[]> {
    return this.firstDelivery.delegationsForGovernorate(governorate);
  }

  private async dispatch(carrier: CarrierName, order: OrderDocument, localityId?: number): Promise<CarrierResult> {
    const codAmount = toDinars(order.manualTotalMinor ?? order.totalMinor);
    const { designation: productLabel, nbArticle: itemsCount } = buildCarrierDesignation(
      order.items.map((i) => ({
        productId: i.productId,
        name: i.name,
        quantity: i.qty,
        variation: i.variation ?? undefined,
        bundleName: i.bundleName ?? undefined,
      })),
    );
    const receiverName = order.customer.firstName + (order.customer.lastName ? ` ${order.customer.lastName}` : '');

    switch (carrier) {
      case 'navex':
        return this.navex.createShipment({
          reference: `#${order.orderNumber}`,
          receiverName,
          receiverPhone: order.customer.phone,
          receiverPhone2: order.customer.phone2 || undefined,
          receiverGov: order.customer.city,
          receiverCity: order.customer.city,
          receiverAddress: order.customer.address,
          codAmount,
          itemsCount,
          productLabel,
          note: order.customer.note || order.privateNote || undefined,
          echange: order.exchange,
        });
      case 'firstdelivery':
        return this.firstDelivery.createShipment({
          receiverName,
          receiverGov: order.customer.city,
          // Prefer the admin-confirmed délégation over the raw governorate —
          // see previewFirstDeliveryLocality's comment above.
          receiverCity: order.customer.locality || order.customer.city,
          receiverAddress: order.customer.address,
          receiverPhone: order.customer.phone,
          receiverPhone2: order.customer.phone2 || undefined,
          codAmount,
          productLabel,
          itemsCount,
          note: order.customer.note || undefined,
          localityId,
        });
      case 'axess':
        return this.axess.createShipment({
          receiverName,
          receiverGov: order.customer.city,
          receiverAddress: order.customer.address,
          receiverPhone: order.customer.phone,
          receiverPhone2: order.customer.phone2 || undefined,
          codAmount,
          productLabel,
          itemsCount,
          reference: `#${order.orderNumber}`,
          note: order.customer.note || undefined,
        });
    }
  }

  private toCarrierResult(c: NonNullable<Order['carrier']['navex']>): CarrierResult {
    return { ok: c.status === 'sent', barcode: c.tracking ?? undefined, raw: c.response, error: c.error ?? undefined };
  }
}
