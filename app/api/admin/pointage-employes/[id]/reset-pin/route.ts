import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest, ApiError } from '@/services/mzali-api/client';
import { withAuthRetry } from '@/services/mzali-api/with-auth-retry';

/** Never returns the PIN — replaces it. See #8. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const bearer = await getValidAccessToken();
    if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const { id } = await params;
    const { pin } = await req.json();
    await withAuthRetry((b) => apiRequest(`/admin/attendance-employees/${id}/reset-pin`, { method: 'POST', bearer: b, body: { pin } }));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 400;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'reset failed' }, { status });
  }
}
