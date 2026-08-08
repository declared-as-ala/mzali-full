/**
 * Single source of truth for order-status vocabulary on the frontend —
 * mirrors backend/src/orders/order-status.ts (not CI-enforced, like the
 * rest of the hand-mirrored contract pairs in this repo; keep both in sync
 * by hand). Every component that used to keep its own local STATUS_LABEL/
 * STATUS_TONE map (CommandesView, OrderDrawer, MyCommandesView,
 * CustomerBadge, the employee dashboard) should import from here instead.
 *
 * 'tentative' used to be a single flat status with a separate `attempts`
 * counter driving the displayed number — disconnected from the status
 * itself, which is how orders ended up displaying "Tentative 0" (the
 * counter defaulted to 0 and nothing kept it in sync). It's now 5 explicit
 * statuses, tentative-1..tentative-5, so the attempt number IS the status.
 */

export const MIN_ATTEMPT = 1;
export const MAX_ATTEMPT = 5;

/** Ordered tentative-1..tentative-5. */
export const TENTATIVE_STATUSES: readonly string[] = Array.from(
  { length: MAX_ATTEMPT - MIN_ATTEMPT + 1 },
  (_, i) => `tentative-${i + MIN_ATTEMPT}`,
);

/** The "Normal" tab's statuses (excludes abandoned checkout-draft + trash),
 *  used both for the list-query status filter and to describe what the
 *  header total actually counts. */
export const NORMAL_STATUSES: readonly string[] = ['en-attente', 'confirme', ...TENTATIVE_STATUSES, 'annule'];

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
  tentative: 'Tentative', // legacy flat status — still rendered gracefully if a stray one slips through
  'auto-draft': 'Brouillon',
  'checkout-draft': 'Abandonnée',
  abandoned: 'Abandonnée',
  abondonne: 'Abandonnée',
  trash: 'Supprimée',
};

export function getOrderStatusLabel(status: string): string {
  const attempt = getAttemptNumber(status);
  if (attempt) return `Tentative ${attempt}`;
  return STATUS_LABEL_FR[status] ?? status;
}

// Every tentative-N shares one consistent orange tone — a graduated
// per-attempt color scheme would just be five variants of "this needs a
// callback," which the flat badge already communicates fine.
const STATUS_TONE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  'en-attente': 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  'on-hold': 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  processing: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  confirme: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  cancelled: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  annule: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  failed: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  refunded: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
  tentative: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  'auto-draft': 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
  'checkout-draft': 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  abandoned: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  abondonne: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  trash: 'bg-red-50 text-red-700 ring-1 ring-red-200',
};
const DEFAULT_TONE = 'bg-ink-100 text-ink-700 ring-1 ring-ink-200';

export function getOrderStatusTone(status: string): string {
  if (isAttemptStatus(status)) return STATUS_TONE.tentative;
  return STATUS_TONE[status] ?? DEFAULT_TONE;
}

const STATUS_CHART_COLOR: Record<string, string> = {
  pending: '#d97706',
  'en-attente': '#d97706',
  'on-hold': '#d97706',
  processing: '#0e55fb',
  confirme: '#059669',
  completed: '#059669',
  cancelled: '#dc2626',
  annule: '#dc2626',
  failed: '#dc2626',
  refunded: '#64748b',
  tentative: '#ea580c',
  'auto-draft': '#64748b',
  'checkout-draft': '#4f46e5',
  abandoned: '#dc2626',
  abondonne: '#dc2626',
  trash: '#dc2626',
};

export function getOrderStatusChartColor(status: string): string {
  if (isAttemptStatus(status)) return STATUS_CHART_COLOR.tentative;
  return STATUS_CHART_COLOR[status] ?? '#64748b';
}
