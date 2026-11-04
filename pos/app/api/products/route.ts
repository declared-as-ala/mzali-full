import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest, ApiError } from '@/lib/api-client';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const search = url.searchParams.get('search') ?? undefined;
  const posOnly = url.searchParams.get('posOnly');
  const page = url.searchParams.get('page') ? Number(url.searchParams.get('page')) : undefined;
  const perPage = url.searchParams.get('perPage') ? Number(url.searchParams.get('perPage')) : 100;

  try {
    const data = await apiRequest('/admin/products', {
      bearer,
      query: {
        page,
        perPage,
        search,
        status: 'published',
        posOnly: true,
      },
    });
    return NextResponse.json(data);
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status });
  }
}

export async function POST(req: Request) {
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const data = await apiRequest('/admin/products', {
      method: 'POST',
      bearer,
      body,
    });
    return NextResponse.json(data);
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status });
  }
}

