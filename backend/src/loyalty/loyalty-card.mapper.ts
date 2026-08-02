import type { Customer } from '@/customers/customer.schema';
import type { LoyaltyCardBatchDocument } from './loyalty-card-batch.schema';
import type { LoyaltyCardDocument } from './loyalty-card.schema';

export function toCardBatchContract(batch: LoyaltyCardBatchDocument, counts: Record<string, number>) {
  const assignedCount = counts.ACTIVE ?? 0;
  const unassignedCount = counts.UNASSIGNED ?? 0;
  const revokedCount = counts.REVOKED ?? 0;
  const otherCount = Object.entries(counts)
    .filter(([status]) => !['ACTIVE', 'UNASSIGNED', 'REVOKED'].includes(status))
    .reduce((sum, [, n]) => sum + n, 0);
  return {
    id: batch.id,
    batchNumber: batch.batchNumber,
    name: batch.name,
    quantity: batch.quantity,
    templateCode: batch.templateCode,
    templateVersion: batch.templateVersion,
    generatedByName: batch.generatedBy.name,
    generatedAt: batch.generatedAt.toISOString(),
    exportedAt: batch.exportedAt ? batch.exportedAt.toISOString() : null,
    printedAt: batch.printedAt ? batch.printedAt.toISOString() : null,
    status: batch.status,
    notes: batch.notes,
    virtual: batch.virtual,
    assignedCount,
    unassignedCount,
    revokedCount,
    otherCount,
  };
}

export function toCardContract(
  doc: LoyaltyCardDocument,
  customer?: Pick<Customer, 'firstName' | 'lastName' | 'phone'> | null,
  batchName?: string | null,
) {
  return {
    id: doc.id,
    cardNumber: doc.cardNumber,
    qrToken: doc.qrToken,
    barcodeValue: doc.barcodeValue,
    batchId: doc.batchId,
    batchName: batchName ?? null,
    templateCode: doc.templateCode,
    status: doc.status,
    accountId: doc.accountId,
    customerId: doc.customerId,
    customerName: customer ? `${customer.firstName} ${customer.lastName}`.trim() : null,
    customerPhone: customer?.phone ?? null,
    assignedAt: doc.assignedAt ? doc.assignedAt.toISOString() : null,
    replacesCardId: doc.replacesCardId,
    replacedByCardId: doc.replacedByCardId,
    revokedAt: doc.revokedAt ? doc.revokedAt.toISOString() : null,
    revokedReason: doc.revokedReason,
    history: doc.history.map((h) => ({
      event: h.event,
      at: h.at.toISOString(),
      byName: h.by.name,
      note: h.note,
    })),
    createdAt: doc.createdAt.toISOString(),
  };
}
