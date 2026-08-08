import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { apiRequest } from '@/services/mzali-api/client';
import { getValidAccessToken } from '@/lib/api-auth';
import { TENTATIVE_STATUSES } from '@/lib/order-status';

const PROVIDER = process.env.COMMERCE_PROVIDER ?? 'woocommerce';

/**
 * Returns the statuses an employee can apply to an order — fallback only,
 * used when mzali-api is unreachable or COMMERCE_PROVIDER is the legacy
 * woocommerce provider; the live path mirrors backend ALLOWED_FOR_EMPLOYEE
 * via GET /employee/orders/statuses. Admin-only / destructive statuses
 * (refunded, etc.) are intentionally absent.
 */
const ALLOWED = [
  'pending', 'en-attente',
  'processing', 'confirme',
  'on-hold', ...TENTATIVE_STATUSES,
  'completed',
  'cancelled', 'annule',
];

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'employee') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (PROVIDER === 'mzali-api') {
    const bearer = await getValidAccessToken();
    if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const statuses = await apiRequest<string[]>('/employee/orders/statuses', { bearer }).catch(() => ALLOWED);
    return NextResponse.json(statuses);
  }

  return NextResponse.json(ALLOWED);
}
