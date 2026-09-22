import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest } from '@/services/mzali-api/client';
import { withAuthRetry } from '@/services/mzali-api/with-auth-retry';

const PROVIDER = process.env.COMMERCE_PROVIDER ?? 'woocommerce';

/**
 * Distinct délégation ("Mo3tamadia") names for one governorate, straight
 * from First Delivery's own live locality directory — powers the Order
 * Drawer's "Localité" picker, scoped to whichever Ville is selected. See
 * backend/src/shipping/first-delivery.service.ts's delegationsForGovernorate.
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
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
