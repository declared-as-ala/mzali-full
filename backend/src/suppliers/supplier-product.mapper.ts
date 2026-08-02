import { SupplierProductDocument } from './supplier-product.schema';

export function toSupplierProductContract(doc: SupplierProductDocument) {
  return {
    id: doc.id,
    supplierId: doc.supplierId,
    name: doc.name,
    category: doc.category,
    brand: doc.brand,
    size: doc.size,
    color: doc.color,
    purchasePriceMinor: doc.purchasePriceMinor,
    suggestedSellingPriceMinor: doc.suggestedSellingPriceMinor,
    notes: doc.notes,
    active: doc.active,
    priceHistory: doc.priceHistory.map((p) => ({ priceMinor: p.priceMinor, at: p.at.toISOString() })),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export type SupplierProductContract = ReturnType<typeof toSupplierProductContract>;
