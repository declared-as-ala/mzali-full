import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Liveness probe for the storefront container.
 * Used by Docker HEALTHCHECK and the CD pipeline's post-deploy smoke test.
 * Intentionally reports no infrastructure details (public robots.txt already
 * disallows /api/).
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'storefront',
    timestamp: new Date().toISOString(),
  });
}
