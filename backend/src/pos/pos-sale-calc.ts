/**
 * Per-variant stock delta between a POS sale's lines before and after an
 * edit — positive means more stock must be deducted, negative means the
 * difference must be restored. Pure/DB-free so it's unit-testable without
 * mongodb-memory-server, mirroring orders/order-calc.ts's computeStockDeltas.
 */
export function computeSaleStockDeltas(
  beforeLines: { variantId: string; qty: number }[],
  afterLines: { variantId: string; qty: number }[],
): Map<string, number> {
  const beforeQty = new Map<string, number>();
  for (const line of beforeLines) beforeQty.set(line.variantId, (beforeQty.get(line.variantId) ?? 0) + line.qty);
  const afterQty = new Map<string, number>();
  for (const line of afterLines) afterQty.set(line.variantId, (afterQty.get(line.variantId) ?? 0) + line.qty);

  const deltas = new Map<string, number>();
  for (const variantId of new Set([...beforeQty.keys(), ...afterQty.keys()])) {
    const delta = (afterQty.get(variantId) ?? 0) - (beforeQty.get(variantId) ?? 0);
    if (delta !== 0) deltas.set(variantId, delta);
  }
  return deltas;
}

/** Sums payment rows for one method — used to compute the cash/card/other
 *  session-total deltas when a sale's payments are edited. */
export function sumByMethod<T extends { method: string; amountMinor: number }>(rows: T[], method: string): number {
  return rows.reduce((sum, r) => sum + (r.method === method ? r.amountMinor : 0), 0);
}
