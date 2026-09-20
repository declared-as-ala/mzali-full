import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest, ApiError } from '@/services/mzali-api/client';

async function proxy(req: Request, { params }: { params: { path?: string[] } }) {
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const path = (params.path ?? []).join('/');
  if (path && !/^\d{4}-\d{2}-\d{2}(\/(pdf|close))?$/.test(path)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  try {
    if (path.endsWith('/pdf')) {
      const base = (process.env.MZALI_API_URL ?? '').replace(/\/$/, '');
      const res = await fetch(`${base}/api/v1/admin/pos/tickets-z/${path}`, { headers: { Authorization: `Bearer ${bearer}` }, cache: 'no-store' });
      if (!res.ok) return NextResponse.json({ error: 'PDF indisponible : vérifiez la clôture de la journée.' }, { status: res.status });
      const date = path.slice(0, 10);
      const download = new URL(req.url).searchParams.get('download') === '1';
      return new Response(res.body, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="ticket-z-${date}.pdf"`, 'Cache-Control': 'private, no-store' } });
    }
    const query = Object.fromEntries(new URL(req.url).searchParams);
    const data = await apiRequest(`/admin/pos/tickets-z${path ? `/${path}` : ''}`, { method: req.method, bearer, query });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: e instanceof ApiError ? e.status : 500 }); }
}
export const GET = proxy;
export const POST = proxy;
