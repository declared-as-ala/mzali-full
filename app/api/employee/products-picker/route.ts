import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { productService } from '@/services';
import { getPrimaryProductImage } from '@/types';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || (session.role !== 'employee' && session.role !== 'admin')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const excludePosOnly = new URL(req.url).searchParams.get('excludePosOnly') === 'true';
  const res = await productService.listAdmin({ perPage: 100, status: 'any', orderBy: 'title', order: 'asc' });
  const items = excludePosOnly ? res.items.filter((p) => !p.posOnly) : res.items;
  return NextResponse.json(
    items.map((p) => ({ id: p.id, name: p.name, price: p.price, image: getPrimaryProductImage(p.images)?.url ?? '' })),
  );
}
