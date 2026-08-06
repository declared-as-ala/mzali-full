import { NextResponse } from 'next/server';
import { apiRequest, ApiError } from '@/lib/api-client';
import { readPosHeaders } from '@/lib/pos-headers';

export async function POST(req: Request) {
  const { deviceFingerprint } = readPosHeaders(req);
  if (!deviceFingerprint) return NextResponse.json({ error: 'fingerprint manquant' }, { status: 400 });
  try {
    const data = await apiRequest('/pos/terminals/pairing', {
      method: 'POST',
      serviceToken: true,
      body: { deviceFingerprint },
    });
    return NextResponse.json(data);
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status });
  }
}
