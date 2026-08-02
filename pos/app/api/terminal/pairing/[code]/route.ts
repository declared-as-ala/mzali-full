import { NextResponse } from 'next/server';
import { apiRequest } from '@/lib/api-client';

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  try {
    const data = await apiRequest(`/pos/terminals/pairing/${code}`, { serviceToken: true });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
