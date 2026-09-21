import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest, ApiError } from '@/services/mzali-api/client';
async function proxy(req: Request, { params }: { params: { path?: string[] } }) {
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const path = (params.path ?? []).join('/');
  if (path && !/^(adjust|movements|products\/[a-f0-9]{24}(\/(add|quantities|boutique|mode))?)$/.test(path)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  try {
    const data = await apiRequest(`/admin/variant-stock${path ? `/${path}` : ''}`, { bearer, method: req.method, query: Object.fromEntries(new URL(req.url).searchParams), ...(req.method === 'POST' ? { body: await req.json() } : {}) });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: e instanceof ApiError ? e.status : 500 }); }
}
export const GET = proxy;
export const POST = proxy;

