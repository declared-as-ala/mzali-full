import { NextResponse } from 'next/server';
import { apiRequest, ApiError } from '@/services/mzali-api/client';

/**
 * The `/pointage` kiosk's entire public surface — no JWT, no cookie, no
 * session. The kiosk sends only a PIN; this route forwards it to the
 * backend's ServiceTokenGuard + rate-limited endpoint (browsers never
 * call the backend directly, matching every other public route in this
 * app). Status codes (notably 429 on rate-limit) are passed through as-is.
 */
export async function POST(req: Request) {
  try {
    const { pin } = await req.json();
    if (!pin) return NextResponse.json({ ok: false }, { status: 400 });
    const result = await apiRequest('/pointage/identify', { method: 'POST', serviceToken: true, body: { pin } });
    return NextResponse.json(result);
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Erreur' }, { status });
  }
}
