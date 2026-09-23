import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest, ApiError } from '@/services/mzali-api/client';

const GET_PATHS = [/^unpaid$/, /^summary$/, /^payments$/, /^payments\/[^/]+$/];
const GET_PDF_PATH = /^payments\/([^/]+)\/pdf$/;
const POST_PATHS = [/^employees\/[^/]+\/pay$/];

async function proxy(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { path: segments } = await params;
  const path = (segments ?? []).join('/');

  const pdfMatch = req.method === 'GET' ? path.match(GET_PDF_PATH) : null;
  if (pdfMatch) {
    try {
      const base = (process.env.MZALI_API_URL ?? '').replace(/\/$/, '');
      const download = new URL(req.url).searchParams.get('download') === '1';
      const res = await fetch(`${base}/api/v1/admin/payroll/${path}${download ? '?download=1' : ''}`, { headers: { Authorization: `Bearer ${bearer}` }, cache: 'no-store' });
      if (!res.ok) return NextResponse.json({ error: 'PDF indisponible. Veuillez réessayer.' }, { status: res.status });
      return new Response(res.body, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${pdfMatch[1]}.pdf"`, 'Cache-Control': 'private, no-store' } });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 });
    }
  }

  const allowed = req.method === 'POST' ? POST_PATHS : GET_PATHS;
  if (!allowed.some((re) => re.test(path))) return NextResponse.json({ error: 'not found' }, { status: 404 });
  try {
    const query = req.method === 'GET' ? Object.fromEntries(new URL(req.url).searchParams) : undefined;
    const body = req.method === 'POST' ? await req.json().catch(() => undefined) : undefined;
    const data = await apiRequest(`/admin/payroll/${path}`, { method: req.method, bearer, query, body });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: e instanceof ApiError ? e.status : 500 });
  }
}
export const GET = proxy;
export const POST = proxy;
