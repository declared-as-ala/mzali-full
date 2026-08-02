import { NextResponse } from 'next/server';
import { orderService } from '@/services';
import { apiRequest } from '@/services/mzali-api/client';
import type { CheckoutPayload } from '@/types';

const PROVIDER = process.env.COMMERCE_PROVIDER ?? 'woocommerce';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { orderId, ...payload } = body as CheckoutPayload & { orderId?: string; couponCode?: string };

    if (!payload?.customer?.phone || !payload?.customer?.firstName) {
      return NextResponse.json({ error: 'Nom et téléphone obligatoires.' }, { status: 400 });
    }
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      return NextResponse.json({ error: 'Panier vide.' }, { status: 400 });
    }

    // mzali-api draft-upsert (orderId present) goes straight to the
    // dedicated public draft endpoint — the generic OrderService.update()
    // method is reserved for authenticated admin/employee edits, which need
    // a bearer token this guest checkout flow doesn't have. See
    // services/mzali-api/mzali-order-service.ts for the full rationale.
    if (PROVIDER === 'mzali-api' && orderId) {
      const order = await apiRequest<{ id: string; number: string; total: number }>(`/orders/${orderId}/draft`, {
        method: 'PUT',
        serviceToken: true,
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
