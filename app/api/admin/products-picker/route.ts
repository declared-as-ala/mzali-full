import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { productService } from '@/services';

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const excludePosOnly = new URL(req.url).searchParams.get('excludePosOnly') === 'true';
  const res = await productService.listAdmin({ perPage: 100, status: 'any', orderBy: 'title', order: 'asc' });
  const items = excludePosOnly ? res.items.filter((p) => !p.posOnly) : res.items;
  return NextResponse.json(
    items.map((p) => ({ id: p.id, name: p.name, price: p.price, image: p.images[0]?.url ?? '' })),
  );
}
