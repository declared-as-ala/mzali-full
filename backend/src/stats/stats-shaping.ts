export type RevenueBucket = {
  date: string;
  revenue: number;
  orders: number;
};

export type RawRevenueBucket = {
  date: string;
  revenueMinor: number;
  orders: number;
};

export const FUNNEL_ORDER = [
  'checkout-draft',
  'en-attente',
  'pending',
  'processing',
  'confirme',
  'completed',
  'tentative',
  'annule',
  'cancelled',
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function zeroFillRevenueDays(
  rows: RawRevenueBucket[],
  start: Date,
  end: Date,
): RevenueBucket[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const result: RevenueBucket[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const finalDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));

  while (cursor <= finalDay) {
    const date = dateKey(cursor);
    const row = byDate.get(date);
    result.push({
      date,
      revenue: row ? row.revenueMinor / 1000 : 0,
      orders: row?.orders ?? 0,
    });
    cursor.setTime(cursor.getTime() + DAY_MS);
  }
  return result;
}

export function orderStatusFunnel(counts: Record<string, number>) {
  const known = FUNNEL_ORDER.map((status) => ({ status, count: counts[status] ?? 0 }));
  const extras = Object.entries(counts)
    .filter(([status]) => !FUNNEL_ORDER.includes(status as (typeof FUNNEL_ORDER)[number]))
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({ status, count }));
  return [...known, ...extras];
}
