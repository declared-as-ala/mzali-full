import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest } from '@/services/mzali-api/client';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const body = await req.json();
    const coupon = await apiRequest(`/admin/coupons/${id}`, { method: 'PUT', bearer, body });
    return NextResponse.json(coupon);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    await apiRequest(`/admin/coupons/${id}`, { method: 'DELETE', bearer });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 });
  }
}
