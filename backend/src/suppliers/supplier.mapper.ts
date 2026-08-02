import type { Supplier as SupplierContract } from '@contracts';
import { SupplierDocument } from './supplier.schema';

export function toSupplierContract(doc: SupplierDocument): SupplierContract {
  return {
    id: doc.id,
    code: doc.code,
    companyName: doc.companyName,
    contactName: doc.contactName,
    email: doc.email,
    phone: doc.phone,
    secondaryPhone: doc.secondaryPhone,
    whatsapp: doc.whatsapp,
    taxIdentifier: doc.taxIdentifier,
    registrationNumber: doc.registrationNumber,
    billingAddress: doc.billingAddress,
    warehouseAddress: doc.warehouseAddress,
    paymentTermsDays: doc.paymentTermsDays,
    preferredPaymentMethod: doc.preferredPaymentMethod,
    currency: doc.currency,
    leadTimeDays: doc.leadTimeDays,
    minimumOrderMinor: doc.minimumOrderMinor,
    status: doc.status,
    notes: doc.notes,
    documentMediaIds: doc.documentMediaIds,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
