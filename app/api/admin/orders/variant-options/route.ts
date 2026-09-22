import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { apiRequest } from '@/services/mzali-api/client';
import { withAuthRetry } from '@/services/mzali-api/with-auth-retry';

export type VariantFilterOption = { value: string; label: string; orderCount: number };

/**
 * Variant sub-filter options for one product on Admin → Commandes — see
 * OrdersService.variantFilterOptions (backend). mzali-api only, same
 * pattern as orders-filter-picker; no WooCommerce-provider equivalent
 * since this depends on the variant-aware backend aggregation.
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const productId = url.searchParams.get('productId') || '';
  if (!productId) return NextResponse.json([]);

  try {
    const items = await withAuthRetry((bearer) =>
      apiRequest<VariantFilterOption[]>('/admin/orders/variant-options', {
        bearer,
        query: {
          productId,
          search: url.searchParams.get('q') || url.searchParams.get('search') || undefined,
          after: url.searchParams.get('after') || undefined,
          before: url.searchParams.get('before') || undefined,
          status: url.searchParams.get('status') || undefined,
          tab: url.searchParams.get('tab') || undefined,
        },
      }),
    );
    return NextResponse.json(items);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
