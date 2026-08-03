import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest } from '@/lib/api-client';
import { readPosHeaders } from '@/lib/pos-headers';

export async function POST(request: Request) {
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { deviceFingerprint, terminalCode } = readPosHeaders(request);
  if (!deviceFingerprint || !terminalCode) return NextResponse.json({ error: 'terminal non appairé' }, { status: 400 });
  try {
    const data = await apiRequest('/pos/hardware/drawer/manual-authorize', {
      method: 'POST', bearer, terminalCode, deviceFingerprint, body: await request.json(),
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'forbidden' }, { status: 403 });
  }
}
