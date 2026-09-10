import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { apiRequest } from '@/services/mzali-api/client';
import { withAuthRetry } from '@/services/mzali-api/with-auth-retry';

export async function GET() {
  const session = await getSession();
  if (!session || (session.role !== 'employee' && session.role !== 'admin')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
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
