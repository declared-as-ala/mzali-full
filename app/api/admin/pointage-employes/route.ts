import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest, ApiError } from '@/services/mzali-api/client';
import { withAuthRetry } from '@/services/mzali-api/with-auth-retry';

/**
 * Isolated Pointage employee roster — deliberately calls the backend
 * directly (no WooCommerce-era provider abstraction to go through, unlike
 * orders/products): this is a brand new domain with no legacy data.
 */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const bearer = await getValidAccessToken();
    if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const employees = await withAuthRetry((b) => apiRequest('/admin/attendance-employees', { bearer: b }));
    return NextResponse.json(employees);
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'list failed' }, { status });
  }
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const bearer = await getValidAccessToken();
    if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const body = await req.json();
    const employee = await withAuthRetry((b) =>
      apiRequest('/admin/attendance-employees', { method: 'POST', bearer: b, body }),
    );
    return NextResponse.json(employee, { status: 201 });
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 400;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'create failed' }, { status });
  }
}
