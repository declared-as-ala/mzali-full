import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest, ApiError } from '@/lib/api-client';
import { readPosHeaders } from '@/lib/pos-headers';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { deviceFingerprint, terminalCode } = readPosHeaders(req);
  if (!deviceFingerprint || !terminalCode) {
    return NextResponse.json({ error: 'terminal non appairé' }, { status: 401 });
  }
  const { id } = await params;
  try {
    const body = await req.json();
    const data = await apiRequest(`/pos/printer/sales/${id}/status`, { method: 'PUT', bearer, terminalCode, deviceFingerprint, body });
    return NextResponse.json(data);
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 400;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status });
  }
}
