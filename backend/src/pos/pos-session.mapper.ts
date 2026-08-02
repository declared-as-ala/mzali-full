import type { PosCashierSession as PosCashierSessionContract } from '@contracts';
import { PosCashierSessionDocument } from './pos-cashier-session.schema';

export function toPosSessionContract(doc: PosCashierSessionDocument): PosCashierSessionContract {
  return {
    id: doc.id,
    cashierId: doc.cashierId,
    terminalId: doc.terminalId,
    registerId: doc.registerId,
    openingCashMinor: doc.openingCashMinor,
    openedAt: doc.openedAt.toISOString(),
    closedAt: doc.closedAt ? doc.closedAt.toISOString() : null,
    closingCountedCashMinor: doc.closingCountedCashMinor,
    status: doc.status,
    grossSalesMinor: doc.grossSalesMinor,
    refundsMinor: doc.refundsMinor,
    discountsMinor: doc.discountsMinor,
    cashSalesMinor: doc.cashSalesMinor,
    cardSalesMinor: doc.cardSalesMinor,
    otherSalesMinor: doc.otherSalesMinor,
    cashMovementsAddMinor: doc.cashMovementsAddMinor,
    cashMovementsRemoveMinor: doc.cashMovementsRemoveMinor,
    transactionCount: doc.transactionCount,
    reviewedAt: doc.reviewedAt ? doc.reviewedAt.toISOString() : null,
    reviewedBy: doc.reviewedBy,
    reviewNote: doc.reviewNote,
  };
}
