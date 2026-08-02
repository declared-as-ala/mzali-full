import type { OrderLineItem, OrderResponse } from '@contracts';
import { toDinars } from '@/common/money';
import { Order } from './order.schema';

/**
 * Maps a stored order to the exact `types/order.ts` OrderResponse contract.
 * `meta` additionally carries the legacy `_mzem_*`/`_navex_*` key names so
 * any admin UI code that still reads `order.meta['_mzem_...']` during the
 * TASK-06 frontend cutover keeps working without a rewrite.
 */
export function toOrderContract(doc: Order & { id?: string; _id?: unknown }): OrderResponse {
  const total = doc.manualTotalMinor ?? doc.totalMinor;

  const items: OrderLineItem[] = doc.items.map((i) => {
    const attributes: { key: string; value: string }[] = [];
    if (i.bundleName) attributes.push({ key: 'Offre', value: i.bundleName });
    if (i.variation) {
      for (const [k, v] of Object.entries(i.variation)) if (v) attributes.push({ key: k, value: v });
    }
    return {
      productId: i.productId,
      name: i.name,
      quantity: i.qty,
      price: toDinars(i.unitPriceMinor),
      total: toDinars(i.totalMinor),
      imageUrl: i.imageUrl ?? undefined,
      attributes: attributes.length > 0 ? attributes : undefined,
    };
  });

  const meta: Record<string, unknown> = {
    _mzem_delivery_company: doc.deliveryCompany || undefined,
    _mzem_phone_2: doc.customer.phone2 || undefined,
    _mzem_private_note: doc.privateNote || undefined,
    _mzem_exchange: doc.exchange ? 'yes' : 'no',
    _mzem_manual_subtotal: doc.manualSubtotalMinor != null ? toDinars(doc.manualSubtotalMinor) : undefined,
    _mzem_manual_total: doc.manualTotalMinor != null ? toDinars(doc.manualTotalMinor) : undefined,
    _mzem_attempts: doc.attempts,
    _mzem_source: doc.source || undefined,
    _mzem_assignment_history: JSON.stringify(doc.assignment.history ?? []),
  };
  if (doc.carrier.navex) {
    meta._navex_status = doc.carrier.navex.status;
    meta._navex_tracking = doc.carrier.navex.tracking ?? undefined;
    meta._navex_error = doc.carrier.navex.error ?? undefined;
  }
  if (doc.carrier.firstdelivery) {
    meta._fd_status = doc.carrier.firstdelivery.status;
    meta._fd_tracking = doc.carrier.firstdelivery.tracking ?? undefined;
    meta._fd_error = doc.carrier.firstdelivery.error ?? undefined;
  }
  if (doc.carrier.axess) {
    meta._axess_status = doc.carrier.axess.status;
    meta._axess_tracking = doc.carrier.axess.tracking ?? undefined;
    meta._axess_error = doc.carrier.axess.error ?? undefined;
  }
  if (doc.coupon) {
    meta._mzem_coupon_code = doc.coupon.code;
    meta._mzem_coupon_discount = toDinars(doc.coupon.discountMinor);
  }

  return {
    id: String(doc.id ?? doc._id),
    number: String(doc.orderNumber),
    status: doc.status,
    currency: doc.currency,
    total: toDinars(total),
    createdAt: doc.createdAt.toISOString(),
    customer: {
      firstName: doc.customer.firstName,
      lastName: doc.customer.lastName || undefined,
      phone: doc.customer.phone,
      phone2: doc.customer.phone2 || undefined,
      email: doc.customer.email || undefined,
      city: doc.customer.city,
      address: doc.customer.address,
      note: doc.customer.note || undefined,
    },
    items,
    shipping: toDinars(doc.shippingMinor),
    assignedEmployeeId: doc.assignment.employeeId,
    assignedAt: doc.assignment.assignedAt ? doc.assignment.assignedAt.toISOString() : null,
    meta,
  };
}
