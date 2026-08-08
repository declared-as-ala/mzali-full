/**
 * Order status semantics — ported verbatim from
 * app/api/employee/orders/[id]/status/route.ts (ALLOWED_FOR_EMPLOYEE) and
 * the Tunisian COD workflow slugs used throughout the legacy system
 * (en-attente/confirme/annule/tentative/checkout-draft) plus the standard
 * WooCommerce statuses the admin console also accepts.
 *
 * 'tentative' used to be a single flat status with a separate, disconnected
 * `attempts` counter field driving the displayed number (which is how
 * "Tentative 0" happened — the counter defaulted to 0 and nothing kept it
 * in sync with the status). It's now 5 explicit statuses, tentative-1
 * through tentative-5, so the attempt number IS the status — see
 * isAttemptStatus/getAttemptNumber/attemptStatus below. Existing
 * status:'tentative' documents are migrated by
 * migration/commands/migrate-tentative-status.command.ts, never deleted.
 */
export const DRAFT_STATUS = 'checkout-draft';
export const DEFAULT_STATUS = 'en-attente';

/** The legacy flat status — no longer settable, kept only so migration/
 *  detection code has one canonical string to check for. */
export const LEGACY_TENTATIVE_STATUS = 'tentative';

export const MIN_ATTEMPT = 1;
export const MAX_ATTEMPT = 5;

/** Ordered tentative-1..tentative-5, matching MIN_ATTEMPT..MAX_ATTEMPT. */
export const TENTATIVE_STATUSES: readonly string[] = Array.from(
  { length: MAX_ATTEMPT - MIN_ATTEMPT + 1 },
  (_, i) => `tentative-${i + MIN_ATTEMPT}`,
);

export function attemptStatus(n: number): string {
  return `tentative-${Math.min(MAX_ATTEMPT, Math.max(MIN_ATTEMPT, Math.round(n)))}`;
}

export function isAttemptStatus(status: string): boolean {
  return TENTATIVE_STATUSES.includes(status);
}

/** Returns the 1-5 attempt number for a tentative-N status, or null for
 *  any other status (including the legacy flat 'tentative'). */
export function getAttemptNumber(status: string): number | null {
  const match = /^tentative-([1-5])$/.exec(status);
  return match ? Number(match[1]) : null;
}

const STATUS_LABEL_FR: Record<string, string> = {
  pending: 'En attente',
  'en-attente': 'En attente',
  'on-hold': 'En attente',
  processing: 'En traitement',
  confirme: 'Confirmée',
  completed: 'Terminée',
  cancelled: 'Annulée',
  annule: 'Annulée',
  refunded: 'Remboursée',
  failed: 'Échouée',
  'auto-draft': 'Brouillon',
  'checkout-draft': 'Abandonnée',
  abandoned: 'Abandonnée',
  abondonne: 'Abandonnée',
  trash: 'Supprimée',
};

/** Single source of truth for the French label shown anywhere a status
 *  renders — used by both the API (e.g. exports/reports) and mirrored by
 *  the frontend's lib/order-status.ts for UI rendering. */
export function getOrderStatusLabel(status: string): string {
  const attempt = getAttemptNumber(status);
  if (attempt) return `Tentative ${attempt}`;
  return STATUS_LABEL_FR[status] ?? status;
}

/**
 * Every status a write (checkout, admin/employee edit, status change) may
 * legally set going forward — used as an @IsIn() validator on the DTOs so a
 * typo or a resurrected 'tentative' can never be written again. Existing
 * documents holding some other legacy value are unaffected; this only
 * gates future writes, it's not a read-side filter.
 */
export const ORDER_STATUS_VALUES: readonly string[] = [
  'pending', 'en-attente',
  'processing',
  'on-hold', ...TENTATIVE_STATUSES,
  'confirme', 'completed',
  'cancelled', 'annule',
  'refunded', 'failed',
  'auto-draft', 'checkout-draft', 'abandoned', 'abondonne',
  'trash',
];

export const ALLOWED_FOR_EMPLOYEE = new Set([
  'pending', 'en-attente',
  'processing', 'confirme',
  'on-hold', ...TENTATIVE_STATUSES,
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
