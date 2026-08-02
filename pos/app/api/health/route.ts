import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Liveness probe for the POS container — Docker HEALTHCHECK + CD smoke test. */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'pos',
    timestamp: new Date().toISOString(),
  });
}
