import { NextResponse } from 'next/server';
import { orderService } from '@/services';
import { apiRequest } from '@/services/mzali-api/client';
import type { CheckoutPayload } from '@/types';

const PROVIDER = process.env.COMMERCE_PROVIDER ?? 'woocommerce';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const idempotencyKey = req.headers.get('idempotency-key') || body.idempotencyKey || undefined;
    const { orderId, ...rawPayload } = body as CheckoutPayload & { orderId?: string; couponCode?: string; idempotencyKey?: string };

    if (!rawPayload?.customer?.phone || !rawPayload.customer.phone.trim()) {
      return NextResponse.json({ error: 'Numéro de téléphone obligatoire.' }, { status: 400 });
    }
    if (!Array.isArray(rawPayload.items) || rawPayload.items.length === 0) {
      return NextResponse.json({ error: 'Panier vide.' }, { status: 400 });
    }

    const payload: CheckoutPayload & { couponCode?: string } = {
      ...rawPayload,
      customer: {
        firstName: rawPayload.customer.firstName ?? '',
        lastName: rawPayload.customer.lastName ?? '',
        phone: rawPayload.customer.phone.trim(),
        phone2: rawPayload.customer.phone2 ?? '',
        email: rawPayload.customer.email ?? '',
        city: rawPayload.customer.city ?? '',
        address: rawPayload.customer.address ?? '',
        note: rawPayload.customer.note ?? '',
      },
    };

    // mzali-api draft-upsert (orderId present) goes straight to the
    // dedicated public draft endpoint — the generic OrderService.update()
    // method is reserved for authenticated admin/employee edits, which need
    // a bearer token this guest checkout flow doesn't have. See
    // services/mzali-api/mzali-order-service.ts for the full rationale.
    if (PROVIDER === 'mzali-api' && orderId) {
      const order = await apiRequest<{ id: string; number: string; total: number }>(`/orders/${orderId}/draft`, {
        method: 'PUT',
        serviceToken: true,
        idempotencyKey,
        body: payload,
      });
      return NextResponse.json({ id: order.id, number: order.number, total: order.total });
    }

    if (orderId) {
      // Update existing order (e.g. update form details or finalize status)
      const order = await orderService.update(orderId, {
        status: payload.status,
        customer: payload.customer,
        shipping: payload.shipping,
        subtotal: payload.subtotal,
        total: payload.total,
        attempts: payload.attempts,
        items: payload.items.map((i) => ({
          productId: i.productId,
          qty: i.qty,
          unitPrice: i.price,
          variation: i.variation,
          bundleName: i.bundleName,
          bundleSlot: i.bundleSlot,
        })),
      });
      return NextResponse.json({ id: order.id, number: order.number, total: order.total });
    } else {
      // Create new order
      const order = await orderService.create(payload);
      return NextResponse.json({ id: order.id, number: order.number, total: order.total });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'order creation/update failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
