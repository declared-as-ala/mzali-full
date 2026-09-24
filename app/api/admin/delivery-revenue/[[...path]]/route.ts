import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest, ApiError } from '@/services/mzali-api/client';
import { withAuthRetry } from '@/services/mzali-api/with-auth-retry';

/** "Chiffre d'affaires commandes" — proxies straight to the backend's
 *  delivery-revenue module. Allow-listed per method so this never
 *  becomes an open proxy onto `/admin/delivery-revenue/*`. */
const GET_PATHS = [/^summary$/, /^by-day$/, /^by-provider$/, /^orders$/];
const POST_PATHS = [/^orders\/[^/]+\/mark-delivered$/, /^export$/];

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
    const data = await withAuthRetry((b) => apiRequest(`/admin/delivery-revenue/${path}`, { method: req.method, bearer: b, query, body }));
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: e instanceof ApiError ? e.status : 500 });
  }
}
export const GET = proxy;
export const POST = proxy;
