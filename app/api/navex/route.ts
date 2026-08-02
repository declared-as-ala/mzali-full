import { NextResponse } from 'next/server';

/**
 * Navex shipment creation — placeholder for Phase 2.
 * Will be reconnected once we own the order model in our custom backend.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'Navex shipment creation is disabled in Phase 1.' },
    { status: 501 },
  );
}
