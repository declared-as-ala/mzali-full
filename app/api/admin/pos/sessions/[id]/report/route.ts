import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest } from '@/services/mzali-api/client';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const type = url.searchParams.get('type') ?? 'Z';
  try {
    const data = await apiRequest(`/admin/pos/sessions/${id}/report`, { bearer, query: { type } });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
