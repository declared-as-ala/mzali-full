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
  const variantId = new URL(req.url).searchParams.get('variantId');
  if (!variantId) return NextResponse.json({ error: 'variantId requis' }, { status: 400 });
  try {
    const data = await apiRequest('/pos/suggestions', {
      bearer, terminalCode, deviceFingerprint, query: { variantId },
    });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
