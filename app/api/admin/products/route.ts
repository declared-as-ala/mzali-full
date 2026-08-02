import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { productService } from '@/services';

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const product = await productService.create(body);
    return NextResponse.json(product);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'create failed' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const { items } = body as { items: { id: string; menuOrder: number }[] };
    if (!Array.isArray(items)) {
      return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
    }
    await productService.reorder(items);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'reorder failed' }, { status: 500 });
  }
}
