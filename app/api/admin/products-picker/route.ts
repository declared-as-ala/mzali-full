import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { productService } from '@/services';

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const res = await productService.listAdmin({ perPage: 100, status: 'any', orderBy: 'title', order: 'asc' });
  return NextResponse.json(
    res.items.map((p) => ({ id: p.id, name: p.name, price: p.price, image: p.images[0]?.url ?? '' })),
  );
}
