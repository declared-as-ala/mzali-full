import type { Variant as VariantContract } from '@contracts';
import { VariantDocument } from './variant.schema';

export function toVariantContract(doc: VariantDocument): VariantContract {
  return {
    id: doc.id,
    productId: doc.productId,
    sku: doc.sku,
    barcode: doc.barcode,
    attributes: doc.attributes,
    active: doc.active,
    sellingPriceMinor: doc.sellingPriceMinor,
    compareAtPriceMinor: doc.compareAtPriceMinor,
    lastPurchaseCostMinor: doc.lastPurchaseCostMinor,
    averageCostMinor: doc.averageCostMinor,
    purchasePriceMinor: doc.purchasePriceMinor,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
