import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest } from '@/services/mzali-api/client';

const REPORTS = new Set([
  'kpis',
  'margin',
  'revenue-series',
  'payment-breakdown',
  'cashiers',
  'products',
  'categories',
  'loyalty',
]);

export async function GET(req: Request, { params }: { params: { report: string } }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!REPORTS.has(params.report)) return NextResponse.json({ error: 'unknown report' }, { status: 404 });
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  try {
    const data = await apiRequest(`/admin/pos/analytics/${params.report}?${searchParams.toString()}`, { bearer });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'stats unavailable' }, { status: 502 });
  }
}
