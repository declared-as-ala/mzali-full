import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest } from '@/services/mzali-api/client';
import { apiErrorResponse } from '@/lib/api-error-response';

/** Live DEPOT stock of one product (per exact variant when it has variants) — read before an order is saved. */
export async function GET(_req: Request, { params }: { params: Promise<{ productId: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { productId } = await params;
  if (!/^[a-f0-9]{24}$/i.test(productId)) return NextResponse.json({ error: 'invalid product' }, { status: 400 });
  try {
    const data = await apiRequest(`/admin/inventory/availability/${productId}`, { bearer });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return apiErrorResponse(e, 'availability failed');
  }
}
