import { NextResponse } from 'next/server';
import { apiRequest } from '@/services/mzali-api/client';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const phone = searchParams.get('phone') ?? undefined;
  const card = searchParams.get('card') ?? undefined;
  if (!phone && !card) return NextResponse.json({ found: false }, { status: 400 });
  try {
    const data = await apiRequest('/loyalty/public/lookup', { serviceToken: true, query: { phone, card } });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ found: false });
  }
}
