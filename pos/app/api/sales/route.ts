import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest } from '@/lib/api-client';
import { readPosHeaders } from '@/lib/pos-headers';

export async function GET(req: Request) {
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { deviceFingerprint, terminalCode } = readPosHeaders(req);
  if (!deviceFingerprint || !terminalCode) {
    return NextResponse.json({ error: 'terminal non appairé' }, { status: 400 });
  }
  const params = new URL(req.url).searchParams;
  try {
    const data = await apiRequest('/pos/sales', {
      bearer,
      terminalCode,
      deviceFingerprint,
      query: {
        page: params.get('page') ?? undefined,
        perPage: params.get('perPage') ?? undefined,
        from: params.get('from') ?? undefined,
        to: params.get('to') ?? undefined,
        status: params.get('status') ?? undefined,
        search: params.get('search') ?? undefined,
        cashierId: params.get('cashierId') ?? undefined,
      },
    });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { deviceFingerprint, terminalCode } = readPosHeaders(req);
  if (!deviceFingerprint || !terminalCode) {
    return NextResponse.json({ error: 'terminal non appairé' }, { status: 400 });
  }
  const idempotencyKey = req.headers.get('idempotency-key') ?? undefined;
  try {
    const body = await req.json();
    const data = await apiRequest('/pos/sales', {
      method: 'POST', bearer, terminalCode, deviceFingerprint, idempotencyKey, body,
    });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 });
  }
}
