import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { apiRequest } from '@/services/mzali-api/client';
import { withAuthRetry } from '@/services/mzali-api/with-auth-retry';

export type VariantFilterOption = { value: string; label: string; orderCount: number };

/**
 * Same read-only picker as app/api/admin/orders/variant-options, reused
 * for the employee console's Commandes view (full filter parity with
 * admin) — mirrors orders-filter-picker's existing pattern of calling the
 * admin-scoped backend endpoint directly with the employee's own bearer.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || (session.role !== 'employee' && session.role !== 'admin')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
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
