import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { productService } from '@/services';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const p = await productService.getById(id);
  return p ? NextResponse.json(p) : NextResponse.json({ error: 'not found' }, { status: 404 });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const body = await req.json();
    const product = await productService.update(id, body);
    return NextResponse.json(product);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'update failed' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    await productService.remove(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'delete failed';
    if (/\b404\b/.test(msg) || /invalid_id/i.test(msg)) {
      return NextResponse.json({ ok: true, alreadyDeleted: true });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
