import { NextResponse } from 'next/server';
import { ApiError } from '@/services/mzali-api/client';

/**
 * BFF error response that keeps the backend's status and, for a stock refusal
 * (code INSUFFICIENT_STOCK), the structured details the order form needs to
 * highlight the exact line while keeping everything else the employee typed.
 */
export function apiErrorResponse(e: unknown, fallback: string) {
  const status = e instanceof ApiError ? e.status : 500;
  const body = e instanceof ApiError && e.body && typeof e.body === 'object' ? (e.body as Record<string, unknown>) : null;
  const payload: Record<string, unknown> = { error: e instanceof Error ? e.message : fallback };
  if (body?.code === 'INSUFFICIENT_STOCK') {
    for (const key of ['code', 'productId', 'variantId', 'variantLabel', 'available', 'requested']) payload[key] = body[key];
  }
  return NextResponse.json(payload, { status });
}
