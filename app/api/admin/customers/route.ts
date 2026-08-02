import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest } from '@/services/mzali-api/client';

const PROVIDER = process.env.COMMERCE_PROVIDER ?? 'woocommerce';

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (PROVIDER !== 'mzali-api') {
    return NextResponse.json({ error: 'not available on this provider' }, { status: 501 });
  }
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  try {
    const data = await apiRequest('/admin/customers', {
      bearer,
      query: {
        page: url.searchParams.get('page') ?? undefined,
        perPage: url.searchParams.get('perPage') ?? undefined,
        search: url.searchParams.get('search') ?? undefined,
      },
    });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'customers unavailable' },
      { status: 502 },
    );
  }
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (PROVIDER !== 'mzali-api') {
    return NextResponse.json({ error: 'not available on this provider' }, { status: 501 });
  }
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const data = await apiRequest('/admin/customers/bulk-delete', {
      method: 'POST',
      bearer,
      body,
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'customer deletion failed' },
      { status: 400 },
    );
  }
}
