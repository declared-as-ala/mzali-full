import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest } from '@/lib/api-client';
import { readPosHeaders } from '@/lib/pos-headers';

/** Live pricing preview for the cart-in-progress — no stock/session side
 *  effects, called on every cart edit so the till screen shows the
 *  authoritative offer-adjusted total without pricing anything client-side. */
export async function POST(req: Request) {
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { deviceFingerprint, terminalCode } = readPosHeaders(req);
  if (!deviceFingerprint || !terminalCode) {
    return NextResponse.json({ error: 'terminal non appairé' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const data = await apiRequest('/pos/sales/quote', {
      method: 'POST', bearer, terminalCode, deviceFingerprint, body,
    });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 });
  }
}
