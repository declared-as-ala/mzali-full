import type { Customer } from '@/customers/customer.schema';
import type { LoyaltyAccountDocument } from './loyalty-account.schema';
import type { LoyaltyTransactionDocument } from './loyalty-transaction.schema';

export function toAccountContract(
  doc: LoyaltyAccountDocument,
  customer?: Pick<Customer, 'firstName' | 'lastName' | 'phone'> | null,
) {
  return {
    id: doc.id,
    customerId: doc.customerId,
    customerName: customer ? `${customer.firstName} ${customer.lastName}`.trim() : '',
    customerPhone: customer?.phone ?? '',
    cardNumber: doc.cardNumber,
    qrCodeValue: doc.qrCodeValue,
    barcodeValue: doc.barcodeValue,
    pointsBalance: doc.pointsBalance,
    lifetimePointsEarned: doc.lifetimePointsEarned,
    lifetimePointsRedeemed: doc.lifetimePointsRedeemed,
    status: doc.status,
    joinedAt: doc.joinedAt.toISOString(),
    lastActivityAt: doc.lastActivityAt ? doc.lastActivityAt.toISOString() : null,
  };
}

export function toTransactionContract(doc: LoyaltyTransactionDocument) {
  return {
    id: doc.id,
    customerId: doc.customerId,
    loyaltyAccountId: doc.loyaltyAccountId,
    type: doc.type,
    pointsDelta: doc.pointsDelta,
    balanceBefore: doc.balanceBefore,
    balanceAfter: doc.balanceAfter,
    sourceType: doc.sourceType,
    sourceId: doc.sourceId,
    reason: doc.reason,
    performedBy: doc.performedBy,
    createdAt: doc.createdAt.toISOString(),
  };
}
