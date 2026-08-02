import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest } from '@/services/mzali-api/client';

const MODES = new Set(['pvc', 'sheet', 'zip']);

export async function POST(_req: Request, { params }: { params: { id: string; mode: string } }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!MODES.has(params.mode)) return NextResponse.json({ error: 'unknown export mode' }, { status: 404 });
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    // Returns raw media ids (mediaId, or frontMediaId/backMediaId for
    // pvc/sheet modes) — rebuild browser-reachable download URLs against
    // this app's own media-download proxy rather than any backend path.
    const data = await apiRequest<Record<string, string>>(
      `/admin/loyalty/card-batches/${encodeURIComponent(params.id)}/export/${params.mode}`,
      { method: 'POST', bearer },
    );
    const downloadUrls: Record<string, string> = {};
    if (data.mediaId) downloadUrls.zipUrl = `/api/admin/media/${data.mediaId}/download`;
    if (data.frontMediaId) downloadUrls.frontUrl = `/api/admin/media/${data.frontMediaId}/download`;
    if (data.backMediaId) downloadUrls.backUrl = `/api/admin/media/${data.backMediaId}/download`;
    return NextResponse.json(downloadUrls);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'export failed' }, { status: 400 });
  }
}
