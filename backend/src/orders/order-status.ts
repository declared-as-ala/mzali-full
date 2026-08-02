/**
 * Order status semantics — ported verbatim from
 * app/api/employee/orders/[id]/status/route.ts (ALLOWED_FOR_EMPLOYEE) and
 * the Tunisian COD workflow slugs used throughout the legacy system
 * (en-attente/confirme/annule/tentative/checkout-draft) plus the standard
 * WooCommerce statuses the admin console also accepts.
 */
export const DRAFT_STATUS = 'checkout-draft';
export const DEFAULT_STATUS = 'en-attente';

export const ALLOWED_FOR_EMPLOYEE = new Set([
  'pending', 'en-attente',
  'processing', 'confirme',
  'on-hold', 'tentative',
  'completed',
  'cancelled', 'annule',
]);

/**
 * Where a status sits in the stock lifecycle:
 * - none:    no stock effect (draft — nothing was reserved yet)
 * - reserve: units are held (reserved) against on-hand stock
 * - commit:  units have been physically shipped/confirmed (on-hand decremented)
 * - release: the order was cancelled — any hold/commit must be undone
 */
export type StockEffect = 'none' | 'reserve' | 'commit' | 'release';

/** Exported so reporting code (pos-analytics.service.ts) can filter to "a
 *  real sale actually happened" without duplicating this list — this is the
 *  exact same set that triggers a Depot stock deduction. */
export const COMMIT_STATUSES = new Set(['confirme', 'completed']);
const RELEASE_STATUSES = new Set(['annule', 'cancelled']);

/**
 * This store does not reserve stock while an order is awaiting phone
 * confirmation ('en-attente' and every other non-terminal status) — COD
 * orders are captured regardless of current stock, and the confirming
 * employee is the real-time check. Stock only moves at the moment an
 * order is confirmed. See docs/pos-platform/stock-business-rules.md.
 */
export function stockEffectForStatus(status: string): StockEffect {
  if (COMMIT_STATUSES.has(status)) return 'commit';
  if (RELEASE_STATUSES.has(status)) return 'release';
  return 'none';
}

export type StockAction = 'reserve' | 'commit' | 'release' | 'restock' | 'none';

/**
 * Given the stock-effect state before and after a status change, decide
 * what ledger action to take. `restock` means stock was already physically
 * decremented (commit) and must be added back (order cancelled post-confirmation).
 */
export function planStockTransition(from: StockEffect, to: StockEffect): StockAction {
  if (from === to) return 'none';
  if (from === 'none' && to === 'reserve') return 'reserve';
  if (from === 'none' && to === 'commit') return 'commit'; // reserve+commit handled together by the caller
  if (from === 'reserve' && to === 'commit') return 'commit';
  if (from === 'reserve' && to === 'release') return 'release';
  if (from === 'commit' && to === 'release') return 'restock';
  // commit -> reserve (un-confirming) and release -> * (reviving a cancelled
  // order) are edge cases the legacy system never exercised; no stock effect.
  return 'none';
}
