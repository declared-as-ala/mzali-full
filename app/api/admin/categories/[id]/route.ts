import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { categoryService } from '@/services';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin()) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const body = await req.json();
    const c = await categoryService.update(id, body);
    return NextResponse.json(c);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'update failed' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin()) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    await categoryService.remove(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'delete failed';
    if (/\b404\b/.test(msg) || /invalid_id/i.test(msg) || /term_invalid/i.test(msg)) {
      return NextResponse.json({ ok: true, alreadyDeleted: true });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
