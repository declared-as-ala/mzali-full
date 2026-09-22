import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/api-auth';
import { previewFirstDelivery } from '@/services/mzali-api/carrier-push';

const PROVIDER = process.env.COMMERCE_PROVIDER ?? 'woocommerce';

/** Same read-only preview as app/api/admin/firstdelivery/preview, for the
 *  employee console — the backend endpoint itself is permission-gated
 *  (shipping.push), matching the existing employee push route above it. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== 'employee') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

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
