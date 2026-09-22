import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/api-auth';
import { previewFirstDelivery } from '@/services/mzali-api/carrier-push';

const PROVIDER = process.env.COMMERCE_PROVIDER ?? 'woocommerce';

/**
 * Read-only: resolves the First Delivery destination (governorate,
 * delegation, locality) an order would currently send to, without
 * calling the carrier API. Used by the Order Drawer to show the admin
 * exactly what will be sent — and to surface "localité à confirmer"
 * when the address is ambiguous — before an actual push happens.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { orderId } = await req.json();
  if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 });

  if (PROVIDER !== 'mzali-api') {
    return NextResponse.json({ error: 'Aperçu First Delivery disponible uniquement sur le fournisseur mzali-api' }, { status: 400 });
  }

  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { status, body } = await previewFirstDelivery(String(orderId), bearer);
  return NextResponse.json(body, { status });
}
