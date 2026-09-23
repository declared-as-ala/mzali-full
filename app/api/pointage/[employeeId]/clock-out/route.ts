import { NextResponse } from 'next/server';
import { apiRequest, ApiError } from '@/services/mzali-api/client';

/** One-click "Sortir" from the kiosk's shared list — no PIN. See
 *  AttendancePublicController's doc for the tradeoff this accepts. */
export async function POST(_req: Request, { params }: { params: Promise<{ employeeId: string }> }) {
  try {
    const { employeeId } = await params;
    const result = await apiRequest(`/pointage/${employeeId}/clock-out`, { method: 'POST', serviceToken: true });
    return NextResponse.json(result);
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Erreur' }, { status });
  }
}
