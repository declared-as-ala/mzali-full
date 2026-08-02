import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest } from '@/services/mzali-api/client';

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  try {
    const data = await apiRequest('/admin/audit-logs', {
      bearer,
      query: {
        page: url.searchParams.get('page') ?? undefined,
        perPage: url.searchParams.get('perPage') ?? undefined,
        entityType: url.searchParams.get('entityType') ?? undefined,
        entityId: url.searchParams.get('entityId') ?? undefined,
        actorId: url.searchParams.get('actorId') ?? undefined,
        action: url.searchParams.get('action') ?? undefined,
        after: url.searchParams.get('after') ?? undefined,
        before: url.searchParams.get('before') ?? undefined,
      },
    });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
