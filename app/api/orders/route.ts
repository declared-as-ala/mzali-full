import { NextResponse } from 'next/server';
import { orderService } from '@/services';
import { apiRequest } from '@/services/mzali-api/client';
import type { CheckoutPayload } from '@/types';

const PROVIDER = process.env.COMMERCE_PROVIDER ?? 'woocommerce';

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const isDraft = url.searchParams.get('draft') === 'true';

    const body = await req.json();
    const idempotencyKey = req.headers.get('idempotency-key') || body.idempotencyKey || undefined;
    const orderId = body.orderId || body.draftId || undefined;

    const phone = body?.customer?.phone?.trim() ?? '';
    if (!phone) {
      return NextResponse.json({ error: 'Numéro de téléphone obligatoire.' }, { status: 400 });
    }
    if (!Array.isArray(body?.items) || body.items.length === 0) {
      return NextResponse.json({ error: 'Panier vide.' }, { status: 400 });
    }

    const customerName = (body.customer?.firstName ?? (body.customer as any)?.name ?? '').trim();
    const customerNote = (body.customer?.note ?? body.note ?? '').trim();

    const normalizedItems = (body.items || []).map((i: any, idx: number) => ({
      lineId: i.lineId || i.variantId || i.productId || `line_${idx}`,
      productId: String(i.productId || ''),
      variantId: i.variantId ? String(i.variantId) : undefined,
      name: String(i.name || ''),
      price: Number(i.price || 0),
      qty: Math.max(1, Number(i.qty || 1)),
      image: i.image ? String(i.image) : '',
      variation: i.variation || undefined,
      bundleItems: i.bundleItems || undefined,
      bundleId: i.bundleId || undefined,
      bundleName: i.bundleName || undefined,
      bundleSlot: i.bundleSlot !== undefined ? Number(i.bundleSlot) : undefined,
    }));

    const payload: CheckoutPayload & { couponCode?: string } = {
      items: normalizedItems,
      customer: {
        firstName: customerName,
        lastName: body.customer?.lastName ?? '',
        phone,
        phone2: body.customer?.phone2 ?? '',
        email: body.customer?.email ?? '',
        city: body.customer?.city ?? '',
        locality: body.customer?.locality ?? '',
        firstDeliveryLocalityId: body.customer?.firstDeliveryLocalityId
          ? Number(body.customer.firstDeliveryLocalityId)
          : undefined,
        address: body.customer?.address ?? '',
        note: customerNote,
      },
      shipping: Number(body.shipping ?? 8),
      paymentMethod: body.paymentMethod || 'cod',
      source: body.source || 'storefront-next',
      status: isDraft ? 'checkout-draft' : (body.status || 'en-attente'),
      couponCode: body.couponCode || undefined,
    };

    // mzali-api draft-upsert (orderId present) goes straight to the
    // dedicated public draft endpoint — the generic OrderService.update()
    // method is reserved for authenticated admin/employee edits.
    if (PROVIDER === 'mzali-api' && orderId) {
      try {
        const order = await apiRequest<{ id: string; number: string; total: number }>(`/orders/${orderId}/draft`, {
          method: 'PUT',
          serviceToken: true,
          idempotencyKey,
          body: payload,
        });
        return NextResponse.json({ id: order.id, number: order.number, total: order.total });
      } catch (err) {
        // If draft doc no longer exists or expired, fall back cleanly to fresh creation
        const order = await orderService.create(payload);
        return NextResponse.json({ id: order.id, number: order.number, total: order.total });
      }
    }

    if (orderId) {
      // Update existing order (e.g. WooCommerce or generic provider)
      try {
        const order = await orderService.update(orderId, {
          status: payload.status,
          customer: payload.customer,
          shipping: payload.shipping,
          subtotal: payload.subtotal,
          total: payload.total,
          attempts: payload.attempts,
          items: payload.items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            qty: i.qty,
            unitPrice: i.price,
            variation: i.variation,
            bundleName: i.bundleName,
            bundleSlot: i.bundleSlot,
          })),
        });
        return NextResponse.json({ id: order.id, number: order.number, total: order.total });
      } catch {
        const order = await orderService.create(payload);
        return NextResponse.json({ id: order.id, number: order.number, total: order.total });
      }
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
