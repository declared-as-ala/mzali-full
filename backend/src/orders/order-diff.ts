/**
 * Pure helpers for OrdersService.update()'s "did anything meaningful
 * change?" decision and the per-line before/after audit detail.
 *
 * Everything here is unit-testable without a database — the service snapshots
 * the persisted order, resolves the requested edit, and asks this module
 * what actually differs. A no-op edit yields an empty change list: no reason
 * demanded, no stock movement, no audit entry, no write at all.
 */

export type ItemSnapshot = {
  productId: string;
  qty: number;
  unitPriceMinor: number;
  variation: Record<string, string> | null;
  bundleName: string | null;
  bundleSlot: number | null;
};

export type CustomerSnapshot = {
  firstName: string;
  lastName: string;
  phone: string;
  phone2: string;
  email: string;
  city: string;
  address: string;
  note: string;
};

export type OrderSnapshot = {
  status: string;
  customer: CustomerSnapshot;
  items: ItemSnapshot[];
  shippingMinor: number;
  deliveryCompany: string;
  exchange: boolean;
  privateNote: string;
  attempts: number;
  manualSubtotalMinor: number | null;
  manualTotalMinor: number | null;
};

/** Fields on a line that the audit trail records per change. */
export type LineFieldChange = {
  field: 'product' | 'quantity' | 'unitPrice' | 'variation' | 'bundle';
  from: unknown;
  to: unknown;
};

export type LineChange = {
  index: number;
  from: ItemSnapshot;
  to: ItemSnapshot;
  fields: LineFieldChange[];
};

export type ItemDiff = {
  added: ItemSnapshot[];
  removed: ItemSnapshot[];
  changed: LineChange[];
};

function normalizedVariation(v: Record<string, string> | null | undefined): Record<string, string> | null {
  if (!v) return null;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (val !== null && val !== undefined && val !== '') out[k] = String(val);
  }
  return Object.keys(out).length ? out : null;
}

function sameVariation(a: Record<string, string> | null, b: Record<string, string> | null): boolean {
  const na = normalizedVariation(a) ?? {};
  const nb = normalizedVariation(b) ?? {};
  const keyOf = (k: string) => k.trim().toLowerCase();
  const keys = new Set([...Object.keys(na).map(keyOf), ...Object.keys(nb).map(keyOf)]);
  for (const k of keys) {
    const vaEntry = Object.entries(na).find(([key]) => keyOf(key) === k);
    const vbEntry = Object.entries(nb).find(([key]) => keyOf(key) === k);
    const va = (vaEntry?.[1] ?? '').trim().toLowerCase();
    const vb = (vbEntry?.[1] ?? '').trim().toLowerCase();
    if (va !== vb) return false;
  }
  return true;
}

export function itemsEqual(a: ItemSnapshot, b: ItemSnapshot): boolean {
  return (
    a.productId === b.productId &&
    a.qty === b.qty &&
    a.unitPriceMinor === b.unitPriceMinor &&
    (a.bundleName ?? null) === (b.bundleName ?? null) &&
    (a.bundleSlot ?? null) === (b.bundleSlot ?? null) &&
    sameVariation(a.variation, b.variation)
  );
}

export function snapshotItems(
  items: { productId: string; qty: number; unitPriceMinor: number; variation?: Record<string, string> | null; bundleName?: string | null; bundleSlot?: number | null }[],
): ItemSnapshot[] {
  return items.map((i) => ({
    productId: i.productId,
    qty: i.qty,
    unitPriceMinor: i.unitPriceMinor,
    variation: normalizedVariation(i.variation),
    bundleName: i.bundleName ?? null,
    bundleSlot: i.bundleSlot ?? null,
  }));
}

/** Per-position field diff between two order lines (array order is the
 *  order-of-record for both persisted and requested items, so index N in
 *  both arrays is the same line — the admin UI never reorders lines). */
export function lineFieldChanges(from: ItemSnapshot, to: ItemSnapshot): LineFieldChange[] {
  const fields: LineFieldChange[] = [];
  if (from.productId !== to.productId) fields.push({ field: 'product', from: from.productId, to: to.productId });
  if (from.qty !== to.qty) fields.push({ field: 'quantity', from: from.qty, to: to.qty });
  if (from.unitPriceMinor !== to.unitPriceMinor) fields.push({ field: 'unitPrice', from: from.unitPriceMinor, to: to.unitPriceMinor });
  if (!sameVariation(from.variation, to.variation)) fields.push({ field: 'variation', from: from.variation, to: to.variation });
  if ((from.bundleName ?? null) !== (to.bundleName ?? null) || (from.bundleSlot ?? null) !== (to.bundleSlot ?? null)) {
    fields.push({
      field: 'bundle',
      from: { name: from.bundleName, slot: from.bundleSlot },
      to: { name: to.bundleName, slot: to.bundleSlot },
    });
  }
  return fields;
}

/**
 * Line-level diff between a persisted order's items and the requested edit.
 * Matching is positional (both arrays are order-of-record) but a line whose
 * productId moved is reported as removed+added rather than a bogus in-place
 * change, so a swapped line can never look like an innocent variation edit.
 */
export function diffItems(before: ItemSnapshot[], after: ItemSnapshot[]): ItemDiff {
  const length = Math.max(before.length, after.length);
  const added: ItemSnapshot[] = [];
  const removed: ItemSnapshot[] = [];
  const changed: LineChange[] = [];
  for (let i = 0; i < length; i++) {
    const b = before[i];
    const a = after[i];
    if (!b) { added.push(a!); continue; }
    if (!a) { removed.push(b); continue; }
    if (!itemsEqual(b, a)) {
      changed.push({ index: i, from: b, to: a, fields: lineFieldChanges(b, a) });
    }
  }
  return { added, removed, changed };
}

export function hasItemChanges(diff: ItemDiff): boolean {
  return diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;
}

export function snapshotCustomer(c: {
  firstName: string; lastName?: string; phone: string; phone2?: string;
  email?: string; city: string; address: string; note?: string;
}): CustomerSnapshot {
  return {
    firstName: c.firstName ?? '',
    lastName: c.lastName ?? '',
    phone: c.phone ?? '',
    phone2: c.phone2 ?? '',
    email: c.email ?? '',
    city: c.city ?? '',
    address: c.address ?? '',
    note: c.note ?? '',
  };
}

export function diffCustomer(before: CustomerSnapshot, after: Partial<CustomerSnapshot>): string[] {
  const changed: string[] = [];
  for (const key of Object.keys(after) as (keyof CustomerSnapshot)[]) {
    if (after[key] === undefined) continue;
    const b = before[key];
    const a = after[key];
    if (b === a) continue;
    // Only meaningful (non-empty-to-empty / empty-to-empty) flips matter.
    if ((b ?? '') === (a ?? '')) continue;
    changed.push(`customer.${key}`);
  }
  return changed;
}
