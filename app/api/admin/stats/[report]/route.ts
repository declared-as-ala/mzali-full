import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest } from '@/services/mzali-api/client';

const REPORTS = new Set([
  'dashboard',
  'revenue-series',
  'status-funnel',
  'carrier-performance',
  'coupon-performance',
  'geography',
  'pos-daily',
  'pos-by-cashier',
]);

export async function GET(req: Request, { params }: { params: { report: string } }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!REPORTS.has(params.report)) return NextResponse.json({ error: 'unknown report' }, { status: 404 });
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  try {
    const data = await apiRequest(`/admin/stats/${params.report}`, {
      bearer,
      query: {
        days: url.searchParams.get('days') ?? undefined,
        granularity: url.searchParams.get('granularity') ?? undefined,
      },
    });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'stats unavailable' },
      { status: 502 },
    );
  }
}
