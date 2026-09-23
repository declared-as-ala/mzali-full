import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest, ApiError } from '@/services/mzali-api/client';
import { withAuthRetry } from '@/services/mzali-api/with-auth-retry';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const bearer = await getValidAccessToken();
    if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const { id } = await params;
    const employee = await withAuthRetry((b) => apiRequest(`/admin/attendance-employees/${id}`, { bearer: b }));
    return NextResponse.json(employee);
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 404;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'not found' }, { status });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const bearer = await getValidAccessToken();
    if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const { id } = await params;
    const body = await req.json();
    const employee = await withAuthRetry((b) =>
      apiRequest(`/admin/attendance-employees/${id}`, { method: 'PUT', bearer: b, body }),
    );
    return NextResponse.json(employee);
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 400;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'update failed' }, { status });
  }
}

/** Deactivates, never deletes — history must survive. See #28. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const bearer = await getValidAccessToken();
    if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const { id } = await params;
    await withAuthRetry((b) => apiRequest(`/admin/attendance-employees/${id}`, { method: 'DELETE', bearer: b }));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 400;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status });
  }
}
