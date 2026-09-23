import { NextResponse } from 'next/server';
import { apiRequest, ApiError } from '@/services/mzali-api/client';

export async function POST(req: Request) {
  try {
    const { pin, source } = await req.json();
    if (!pin) return NextResponse.json({ ok: false }, { status: 400 });
    const result = await apiRequest('/pointage/clock-in', {
      method: 'POST',
      serviceToken: true,
      body: { pin, source: source ?? 'pointage-kiosk' },
    });
    return NextResponse.json(result);
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Erreur' }, { status });
  }
}
