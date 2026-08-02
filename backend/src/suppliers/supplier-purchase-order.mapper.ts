import { SupplierPurchaseOrderDocument } from './supplier-purchase-order.schema';

export function toSupplierPurchaseOrderContract(doc: SupplierPurchaseOrderDocument, supplierName: string) {
  return {
    id: doc.id,
    poNumber: doc.poNumber,
    supplierId: doc.supplierId,
    supplierName,
    orderDate: doc.orderDate.toISOString(),
    lines: doc.lines.map((l) => ({
      supplierProductId: l.supplierProductId,
      name: l.name,
      category: l.category,
      brand: l.brand,
      size: l.size,
      color: l.color,
      quantity: l.quantity,
      unitPriceMinor: l.unitPriceMinor,
      lineTotalMinor: l.lineTotalMinor,
    })),
    totalMinor: doc.totalMinor,
    notes: doc.notes,
    status: doc.status,
    pdfMediaId: doc.pdfMediaId,
    createdAt: doc.createdAt.toISOString(),
  };
}

export type SupplierPurchaseOrderContract = ReturnType<typeof toSupplierPurchaseOrderContract>;
