import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest } from '@/services/mzali-api/client';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const data = await apiRequest(`/admin/suppliers/${id}`, { bearer });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await req.json();
    const data = await apiRequest(`/admin/suppliers/${id}`, { method: 'PATCH', bearer, body });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const data = await apiRequest(`/admin/suppliers/${id}`, { method: 'DELETE', bearer });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 });
  }
}
