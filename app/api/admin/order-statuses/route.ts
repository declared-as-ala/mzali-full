import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { orderService } from '@/services';
import { apiRequest } from '@/services/mzali-api/client';
import { getValidAccessToken } from '@/lib/api-auth';

const PROVIDER = process.env.COMMERCE_PROVIDER ?? 'woocommerce';
const FALLBACK = ['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed'];

/**
 * Returns the unique status slugs currently used in the store, so the order
 * drawer always shows valid options — works even on custom-status plugins.
 * Standard WC statuses are appended as fallback.
 */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (PROVIDER === 'mzali-api') {
    const bearer = await getValidAccessToken();
    if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const statuses = await apiRequest<string[]>('/admin/order-statuses', { bearer }).catch(() => FALLBACK);
    return NextResponse.json(statuses);
  }

  try {
    const res = await orderService.list({ perPage: 100 });
    const found = Array.from(new Set(res.items.map((o) => String(o.status)))).filter(Boolean);
    const merged = Array.from(new Set([...found, ...FALLBACK]));
    return NextResponse.json(merged);
  } catch {
    return NextResponse.json(FALLBACK);
  }
}
