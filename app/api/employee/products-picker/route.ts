import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { productService } from '@/services';

export async function GET() {
  const session = await getSession();
  if (!session || (session.role !== 'employee' && session.role !== 'admin')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const res = await productService.list({ perPage: 100, orderBy: 'title', order: 'asc' });
  return NextResponse.json(
    res.items.map((p) => ({ id: p.id, name: p.name, price: p.price, image: p.images[0]?.url ?? '' })),
  );
}
