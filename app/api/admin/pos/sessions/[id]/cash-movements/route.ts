import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest, ApiError } from '@/services/mzali-api/client';
async function proxy(req: Request, { params }: { params: { id: string } }) {
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const data = await apiRequest(`/admin/pos/sessions/${encodeURIComponent(params.id)}/cash-movements`, { bearer, method: req.method, ...(req.method === 'POST' ? { body: await req.json() } : {}) });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: e instanceof ApiError ? e.status : 500 }); }
}
export const GET = proxy;
export const POST = proxy;
