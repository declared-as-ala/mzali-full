import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest, ApiError } from '@/lib/api-client';
import { readPosHeaders } from '@/lib/pos-headers';

export async function GET(req: Request) {
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { deviceFingerprint, terminalCode } = readPosHeaders(req);
  if (!deviceFingerprint || !terminalCode) {
    return NextResponse.json({ error: 'terminal non appairé' }, { status: 401 });
  }
  try {
    const data = await apiRequest('/pos/sessions/current', { bearer, terminalCode, deviceFingerprint });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status });
  }
}

export async function POST(req: Request) {
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { deviceFingerprint, terminalCode } = readPosHeaders(req);
  if (!deviceFingerprint || !terminalCode) {
    return NextResponse.json({ error: 'terminal non appairé' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const data = await apiRequest('/pos/sessions/open', { method: 'POST', bearer, terminalCode, deviceFingerprint, body });
    return NextResponse.json(data);
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 400;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status });
  }
}
