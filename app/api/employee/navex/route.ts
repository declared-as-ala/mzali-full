import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { orderService } from '@/services';
import { wooClient } from '@/services/woo/woo-client';
import type { WooOrderRaw } from '@/services/woo/woo-types';
import { navex, navexConfigured, buildNavexDesignation } from '@/lib/navex';
import { alreadySentResponse, withDeliveryLock } from '@/lib/delivery-idempotency';
import { getValidAccessToken } from '@/lib/api-auth';
import { pushCarrier } from '@/services/mzali-api/carrier-push';

const PROVIDER = process.env.COMMERCE_PROVIDER ?? 'woocommerce';

/** Manual Navex push for an order owned by the calling employee. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== 'employee') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { orderId } = await req.json();
  if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 });

  if (PROVIDER === 'mzali-api') {
    // Ownership is enforced server-side by the backend (403 if not own order).
    const bearer = await getValidAccessToken();
    if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const { status, body } = await pushCarrier('employee', 'navex', String(orderId), bearer);
    return NextResponse.json(body, { status });
  }

  if (!navexConfigured) return NextResponse.json({ error: 'Navex non configuré' }, { status: 400 });

  return withDeliveryLock(`navex:${orderId}`, async () => {
    const order = await orderService.getById(String(orderId));
    if (!order) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (order.assignedEmployeeId !== session.userId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const existingTracking = String((order.meta?._navex_tracking as string) ?? '').trim();
    if (existingTracking || order.meta?._navex_status === 'sent') {
      return NextResponse.json(alreadySentResponse(existingTracking), { status: 200 });
    }

    const codAmount = order.total;
    const { designation: productLabel, nbArticle: itemsCount } = buildNavexDesignation(order.items);

    const result = await navex.createShipment({
      reference: `#${order.number || order.id}`,
      receiverName: order.customer.firstName + (order.customer.lastName ? ' ' + order.customer.lastName : ''),
      receiverPhone: order.customer.phone,
      receiverGov: order.customer.city,
      receiverCity: order.customer.city,
      receiverAddress: order.customer.address,
      codAmount,
      itemsCount,
      productLabel,
    });

    const meta: { key: string; value: unknown }[] = [
      { key: '_navex_status', value: result.ok ? 'sent' : 'failed' },
      { key: '_navex_response', value: typeof result.raw === 'string' ? result.raw : JSON.stringify(result.raw ?? null) },
    ];
    if (result.barcode) meta.push({ key: '_navex_tracking', value: result.barcode });
    if (result.error) meta.push({ key: '_navex_error', value: result.error });
    try { await wooClient.put<WooOrderRaw>(`/orders/${order.id}`, { meta_data: meta }); } catch {}

    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  });
}
