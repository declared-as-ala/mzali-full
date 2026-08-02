import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest } from '@/services/mzali-api/client';

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    // Backend export endpoint takes the report/format/filter fields as query
    // params (not a body) — mirror that here instead of forwarding req.body.
    const data = await apiRequest<{ mediaId: string }>('/admin/pos/analytics/export', { method: 'POST', bearer, query: body });
    // The backend's own `downloadUrl` field is a backend-relative path the
    // browser can't reach directly (BFF pattern) — rebuild it against this
    // app's own media-download proxy instead.
    return NextResponse.json({ mediaId: data.mediaId, downloadUrl: `/api/admin/media/${data.mediaId}/download` });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'export failed' }, { status: 400 });
  }
}
