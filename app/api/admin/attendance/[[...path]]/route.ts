import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest, ApiError } from '@/services/mzali-api/client';
import { withAuthRetry } from '@/services/mzali-api/with-auth-retry';

/** Reporting/dashboard/correction side of the isolated Pointage admin UI
 *  — proxies straight to the backend (no legacy-provider abstraction, see
 *  pointage-employes' route for the precedent). Allow-listed per method
 *  so this never becomes an open proxy onto `/admin/attendance/*`. */
const GET_PATHS = [/^dashboard$/, /^sessions$/, /^employees\/[^/]+\/summary$/, /^employees\/[^/]+\/daily$/, /^top-employees$/];
const POST_PATHS = [/^sessions\/[^/]+\/correct$/];

async function proxy(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { path: segments } = await params;
  const path = (segments ?? []).join('/');
  const allowed = req.method === 'POST' ? POST_PATHS : GET_PATHS;
  if (!allowed.some((re) => re.test(path))) return NextResponse.json({ error: 'not found' }, { status: 404 });
  try {
    const query = req.method === 'GET' ? Object.fromEntries(new URL(req.url).searchParams) : undefined;
    const body = req.method === 'POST' ? await req.json().catch(() => undefined) : undefined;
    const data = await withAuthRetry((b) => apiRequest(`/admin/attendance/${path}`, { method: req.method, bearer: b, query, body }));
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: e instanceof ApiError ? e.status : 500 });
  }
}
export const GET = proxy;
export const POST = proxy;
