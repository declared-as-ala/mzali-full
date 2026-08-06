import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest } from '@/lib/api-client';
import { readPosHeaders } from '@/lib/pos-headers';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { deviceFingerprint, terminalCode } = readPosHeaders(req);
  if (!deviceFingerprint || !terminalCode) {
    return NextResponse.json({ error: 'terminal non appairé' }, { status: 401 });
  }
  const url = new URL(req.url);
  const type = url.searchParams.get('type') ?? 'X';
  try {
    const data = await apiRequest(`/pos/sessions/${id}/report`, {
      bearer, terminalCode, deviceFingerprint, query: { type },
    });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 });
  }
}
