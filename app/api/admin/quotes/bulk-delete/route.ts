import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest } from '@/services/mzali-api/client';

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const data = await apiRequest('/admin/quotes/bulk-delete', {
      method: 'POST',
      bearer,
      body,
    });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
