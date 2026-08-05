import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { orderService } from '@/services';
import { ApiError } from '@/services/mzali-api/client';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const o = await orderService.getById(id);
  return o ? NextResponse.json(o) : NextResponse.json({ error: 'not found' }, { status: 404 });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const body = await req.json();
    const order = await orderService.update(id, body);
    return NextResponse.json(order);
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'update failed' }, { status });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    await orderService.remove(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'delete failed';
    if (/\b404\b/.test(msg) || /invalid_id/i.test(msg)) {
      return NextResponse.json({ ok: true, alreadyDeleted: true });
    }
    const status = e instanceof ApiError ? e.status : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
