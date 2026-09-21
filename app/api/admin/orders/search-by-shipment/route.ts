import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { orderService } from '@/services';
import { ApiError } from '@/services/mzali-api/client';

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const code = url.searchParams.get('code') || '';
  if (!code.trim()) {
    return NextResponse.json({ error: 'Code requis' }, { status: 400 });
  }
  try {
    const result = await orderService.searchByShipment(code);
    return NextResponse.json(result);
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Recherche échouée' }, { status });
  }
}
