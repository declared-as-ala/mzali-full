import type { DeliveryRevenuePreset } from '@contracts';

/**
 * Africa/Tunis date-range resolution for the "Chiffre d'affaires
 * commandes" page — a domain-scoped helper, deliberately not shared with
 * attendance-date.ts's near-identical helpers (see that file's own doc
 * on why this codebase prefers one small helper per feature over a
 * generic cross-domain util).
 */

function tunisCalendarToday(): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function tunisToday(): string {
  return toDateStr(tunisCalendarToday());
}

export function tunisYesterday(): string {
  const today = tunisCalendarToday();
  return toDateStr(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1)));
}

export function tunisStartOfWeek(): string {
  const today = tunisCalendarToday();
  const dow = today.getUTCDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() + diff);
  return toDateStr(monday);
}

export function tunisStartOfMonth(): string {
  const today = tunisCalendarToday();
  return toDateStr(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
}

export function tunisStartOfYear(): string {
  const today = tunisCalendarToday();
  return toDateStr(new Date(Date.UTC(today.getUTCFullYear(), 0, 1)));
}

/** First/last day of the PREVIOUS calendar month. */
export function tunisLastMonthRange(): { from: string; to: string } {
  const today = tunisCalendarToday();
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0)); // day 0 of this month = last day of previous month
  return { from: toDateStr(from), to: toDateStr(to) };
}

export type DeliveryRevenueRange = { from: string; to: string };

export function resolveDeliveryRevenueRange(preset: DeliveryRevenuePreset | undefined, from?: string, to?: string): DeliveryRevenueRange {
  if (preset === 'custom' || (!preset && (from || to))) {
    const today = tunisToday();
    return { from: from || today, to: to || today };
  }
  switch (preset) {
    case 'yesterday': { const y = tunisYesterday(); return { from: y, to: y }; }
    case 'thisWeek': return { from: tunisStartOfWeek(), to: tunisToday() };
    case 'thisMonth': return { from: tunisStartOfMonth(), to: tunisToday() };
    case 'lastMonth': return tunisLastMonthRange();
    case 'thisYear': return { from: tunisStartOfYear(), to: tunisToday() };
    case 'today':
    default: { const t = tunisToday(); return { from: t, to: t }; }
  }
}

/** Tunisia has no DST (see attendanceBusinessDate's precedent) — a fixed
 *  UTC+1 offset for the day boundary is safe here too. */
const TUNIS_OFFSET = '+01:00';

/** Inclusive `from`..`to` (YYYY-MM-DD, Tunis-local) → UTC instant bounds
 *  for a Mongo `{$gte, $lt}` range query against `deliveredAt`. */
export function rangeToUtcBounds(range: DeliveryRevenueRange): { start: Date; endExclusive: Date } {
  const start = new Date(`${range.from}T00:00:00${TUNIS_OFFSET}`);
  const endDayStart = new Date(`${range.to}T00:00:00${TUNIS_OFFSET}`);
  const endExclusive = new Date(endDayStart.getTime() + 24 * 60 * 60 * 1000);
  return { start, endExclusive };
}
