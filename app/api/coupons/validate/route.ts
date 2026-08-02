import { NextResponse } from 'next/server';
import { apiRequest } from '@/services/mzali-api/client';

const PROVIDER = process.env.COMMERCE_PROVIDER ?? 'woocommerce';

export async function POST(req: Request) {
  if (PROVIDER !== 'mzali-api') {
    return NextResponse.json({ valid: false, reason: 'Codes promo non disponibles' }, { status: 200 });
  }
  try {
    const body = await req.json();
    const result = await apiRequest('/coupons/validate', { method: 'POST', serviceToken: true, body });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ valid: false, reason: e instanceof Error ? e.message : 'Erreur' }, { status: 200 });
  }
}
