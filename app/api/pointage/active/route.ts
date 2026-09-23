import { NextResponse } from 'next/server';
import { apiRequest, ApiError } from '@/services/mzali-api/client';

/** The kiosk's shared "who's here" list — no PIN needed to view. See
 *  AttendancePublicController's doc for the tradeoff this accepts. */
export async function GET() {
  try {
    const result = await apiRequest('/pointage/active', { serviceToken: true });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status });
  }
}
