import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { orderService } from '@/services';
import { wooClient } from '@/services/woo/woo-client';
import type { WooOrderRaw } from '@/services/woo/woo-types';
import { axess, axessConfigured, buildAxessDesignation } from '@/lib/axess';
import { alreadySentResponse, withDeliveryLock } from '@/lib/delivery-idempotency';
import { getValidAccessToken } from '@/lib/api-auth';
import { pushCarrier } from '@/services/mzali-api/carrier-push';

const PROVIDER = process.env.COMMERCE_PROVIDER ?? 'woocommerce';

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { orderId } = await req.json();
  if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 });

  if (PROVIDER === 'mzali-api') {
    const bearer = await getValidAccessToken();
    if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const { status, body } = await pushCarrier('admin', 'axess', String(orderId), bearer);
    return NextResponse.json(body, { status });
  }

  if (!axessConfigured) return NextResponse.json({ error: 'Axess non configuré (env)' }, { status: 400 });

  return withDeliveryLock(`axess:${orderId}`, async () => {
    const order = await orderService.getById(String(orderId));
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    const existingTracking = String((order.meta?._axess_tracking as string) ?? '').trim();
    if (existingTracking || order.meta?._axess_status === 'sent') {
      return NextResponse.json(alreadySentResponse(existingTracking), { status: 200 });
    }

    const codAmount = order.total;
    const { designation: productLabel, nbArticle: itemsCount } = buildAxessDesignation(order.items);

    const result = await axess.createShipment({
      reference: `#${order.number || order.id}`,
      receiverName: (order.customer.firstName ?? '') + (order.customer.lastName ? ' ' + order.customer.lastName : ''),
      receiverPhone: order.customer.phone,
      receiverPhone2: String((order.meta?._mzem_phone_2 as string) ?? ''),
      receiverGov: order.customer.city ?? '',
      receiverAddress: order.customer.address ?? '',
      codAmount,
      itemsCount,
      productLabel,
      note: String((order.meta?._mzem_private_note as string) ?? ''),
    });

    const meta: { key: string; value: unknown }[] = [
      { key: '_axess_status', value: result.ok ? 'sent' : 'failed' },
      { key: '_axess_response', value: typeof result.raw === 'string' ? result.raw : JSON.stringify(result.raw ?? null) },
    ];
    if (result.barcode) meta.push({ key: '_axess_tracking', value: result.barcode });
    if (result.error) meta.push({ key: '_axess_error', value: result.error });
    try { await wooClient.put<WooOrderRaw>(`/orders/${order.id}`, { meta_data: meta }); } catch {}

    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  });
}
