import type { Stocktake as StocktakeContract } from '@contracts';
import { StocktakeDocument } from './stocktake.schema';

/** `revealExpected: false` powers the blind-count-safe count-entry endpoint
 *  — omits expectedQuantity entirely rather than sending it masked/zeroed. */
export function toStocktakeContract(doc: StocktakeDocument, revealExpected = true): StocktakeContract {
  const showExpected = revealExpected || !doc.blindCount;
  return {
    id: doc.id,
    stocktakeNumber: `INV-${String(doc.stocktakeNumber).padStart(6, '0')}`,
    locationId: doc.locationId,
    status: doc.status,
    scope: { kind: doc.scope.kind, categoryIds: doc.scope.categoryIds },
    blindCount: doc.blindCount,
    lines: doc.lines.map((l) => ({
      variantId: l.variantId,
      productId: l.productId,
      productName: l.productName,
      ...(showExpected ? { expectedQuantity: l.expectedQuantity } : {}),
      countedQuantity: l.countedQuantity,
      difference: showExpected ? l.difference : null,
      reasonIfLarge: l.reasonIfLarge,
    })),
    startedBy: doc.startedBy,
    approvedBy: doc.approvedBy,
    postedAt: doc.postedAt ? doc.postedAt.toISOString() : null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
