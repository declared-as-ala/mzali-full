import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { revalidateStorefront } from '@/lib/revalidate-storefront';
import { productService } from '@/services';
import { ApiError } from '@/services/mzali-api/client';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const p = await productService.getByIdAdmin(id);
  return p
    ? NextResponse.json(p, { headers: { 'Cache-Control': 'no-store' } })
    : NextResponse.json({ error: 'not found' }, { status: 404 });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const body = await req.json();
    const product = await productService.update(id, body, { requestId: req.headers.get('x-request-id') ?? undefined });
    revalidateStorefront();
    return NextResponse.json(product);
  } catch (e) {
    // Keep the backend's status (notably 409 = the product changed since it was opened).
    const status = e instanceof ApiError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'update failed' }, { status });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    await productService.remove(id);
    revalidateStorefront();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'delete failed';
    if (/\b404\b/.test(msg) || /invalid_id/i.test(msg)) {
      return NextResponse.json({ ok: true, alreadyDeleted: true });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
