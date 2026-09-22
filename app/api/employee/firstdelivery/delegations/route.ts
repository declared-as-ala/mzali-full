import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest } from '@/services/mzali-api/client';
import { withAuthRetry } from '@/services/mzali-api/with-auth-retry';

const PROVIDER = process.env.COMMERCE_PROVIDER ?? 'woocommerce';

/** Same picker as app/api/admin/firstdelivery/delegations, for the
 *  employee console — calls the admin-scoped backend endpoint directly
 *  with the employee's own bearer, matching orders-filter-picker's
 *  existing pattern. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== 'employee') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const governorate = url.searchParams.get('governorate') || '';
  if (!governorate) return NextResponse.json([]);

  if (PROVIDER !== 'mzali-api') return NextResponse.json([]);

  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const delegations = await withAuthRetry((b) =>
      apiRequest<string[]>('/admin/shipping/firstdelivery/delegations', { bearer: b, query: { governorate } }),
    );
    return NextResponse.json(delegations);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
