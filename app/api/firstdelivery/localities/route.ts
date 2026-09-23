import { NextResponse } from 'next/server';
import { apiRequest } from '@/services/mzali-api/client';

const PROVIDER = process.env.COMMERCE_PROVIDER ?? 'woocommerce';

export type FirstDeliveryLocality = {
  locality_id: number;
  locality_name: string;
  delegation_name: string;
  governorate_name: string;
};

/**
 * Public locality picker — Tunisia's governorate → délégation
 * ("Mo3tamadia") → locality breakdown, straight from First Delivery's own
 * live directory. Shared by the checkout page (guest customers picking
 * their own exact locality) and the admin/employee Order Drawer (same
 * picker, same data) — not sensitive data, so one route, no auth check,
 * matching backend/src/shipping/shipping-public.controller.ts.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const governorate = url.searchParams.get('governorate') || '';
  if (!governorate) return NextResponse.json([]);
  if (PROVIDER !== 'mzali-api') return NextResponse.json([]);

  try {
    const localities = await apiRequest<FirstDeliveryLocality[]>('/shipping/firstdelivery/localities', {
      serviceToken: true,
      query: { governorate },
    });
    return NextResponse.json(localities);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
