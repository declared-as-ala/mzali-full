import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { apiRequest } from '@/services/mzali-api/client';
import { withAuthRetry } from '@/services/mzali-api/with-auth-retry';

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const items = await withAuthRetry((bearer) =>
      apiRequest<{ id: string; name: string; sku: string | null }[]>(
        '/admin/products/orders-filter-picker',
        { bearer },
      ),
    );
    return NextResponse.json(items);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
