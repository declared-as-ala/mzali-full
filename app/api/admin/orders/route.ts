import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { orderService } from '@/services';
import { ApiError } from '@/services/mzali-api/client';

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const order = await orderService.create(body);
    return NextResponse.json(order);
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'create failed' }, { status });
  }
}

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get('perPage')) || 100));
  const status = url.searchParams.get('status') || undefined;
  const search = url.searchParams.get('q') || url.searchParams.get('search') || undefined;
  const after = url.searchParams.get('after') || undefined;
  const before = url.searchParams.get('before') || undefined;
  const sortOrder = (url.searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
  const productId = url.searchParams.get('productId') || url.searchParams.get('product') || undefined;
  const variantId = url.searchParams.get('variantId') || url.searchParams.get('variant') || undefined;

  try {
    const result = await orderService.list({
      page,
      perPage,
      status: status as any,
      search,
      after,
      before,
      sortOrder,
      productId,
      variantId,
    });
    return NextResponse.json(result);
  } catch (e) {
    const st = e instanceof ApiError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'list failed' }, { status: st });
  }
}
