import { addMinor, multiplyMinor, subtractMinor } from '@/common/money';

export type OrderCalcItem = { unitPriceMinor: number; qty: number };

export type OrderTotals = {
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  totalMinor: number;
};

/**
 * Server-side order totals — the single source of truth. Client-sent
 * totals are never trusted; they're only compared for logging (see
 * OrdersService.create).
 */
export function computeOrderTotals(items: OrderCalcItem[], shippingMinor: number, discountMinor: number): OrderTotals {
  const subtotalMinor = items.length > 0
    ? addMinor(...items.map((i) => multiplyMinor(i.unitPriceMinor, i.qty)))
    : 0;
  const clampedDiscount = Math.max(0, Math.min(discountMinor, subtotalMinor));
  const totalMinor = addMinor(subtractMinor(subtotalMinor, clampedDiscount), shippingMinor);
  return { subtotalMinor, discountMinor: clampedDiscount, shippingMinor, totalMinor };
}

/**
 * Per-product stock delta between an order's items before and after an
 * edit — positive means more stock must be committed (deducted), negative
 * means the difference must be restored. Only meaningful when the order
 * was already stock-committed (status in COMMIT_STATUSES) before the edit;
 * OrdersService.update() only calls this in that case — see the class-level
 * note there for why the delta (not a full re-deduct/re-restore) is
 * required to avoid double-counting stock already taken.
 */
export function computeStockDeltas(
  beforeItems: { productId: string; qty: number }[],
  afterItems: { productId: string; qty: number }[],
): Map<string, number> {
  const beforeQty = new Map<string, number>();
  for (const item of beforeItems) beforeQty.set(item.productId, (beforeQty.get(item.productId) ?? 0) + item.qty);
  const afterQty = new Map<string, number>();
  for (const item of afterItems) afterQty.set(item.productId, (afterQty.get(item.productId) ?? 0) + item.qty);

  const deltas = new Map<string, number>();
  for (const productId of new Set([...beforeQty.keys(), ...afterQty.keys()])) {
    const delta = (afterQty.get(productId) ?? 0) - (beforeQty.get(productId) ?? 0);
    if (delta !== 0) deltas.set(productId, delta);
  }
  return deltas;
}
