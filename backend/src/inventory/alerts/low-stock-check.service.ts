import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product } from '@/catalog/product.schema';
import { Variant } from '@/catalog/variant.schema';
import { Alert, AlertType } from './alert.schema';
import { StockItem } from '../stock-item.schema';

@Injectable()
export class LowStockCheckService {
  private readonly logger = new Logger(LowStockCheckService.name);

  constructor(
    @InjectModel(StockItem.name) private readonly stockItems: Model<StockItem>,
    @InjectModel(Alert.name) private readonly alerts: Model<Alert>,
    @InjectModel(Variant.name) private readonly variants: Model<Variant>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
  ) {}

  async run(): Promise<{ active: number; resolved: number }> {
    const items = await this.stockItems.find({
      $or: [{ lowStockThreshold: { $ne: null } }, { reorderPoint: { $gt: 0 } }],
    });

    const variantIds = [...new Set(items.map((i) => i.variantId))];
    const variantDocs = variantIds.length
      ? await this.variants.find({ _id: { $in: variantIds } }).select({ productId: 1 })
      : [];
    const productIdByVariant = new Map(variantDocs.map((v) => [v.id, v.productId]));
    const productIds = [...new Set(Array.from(productIdByVariant.values()))];
    const productDocs = productIds.length
      ? await this.products.find({ _id: { $in: productIds } }).select({ name: 1 })
      : [];
    const productNameById = new Map(productDocs.map((p) => [p.id, p.name]));

    const qualifying: { variantId: string; locationId: string; type: AlertType; available: number; threshold: number; negativeStock: boolean; productId: string; productName: string }[] = [];

    for (const item of items) {
      const threshold = Math.max(item.lowStockThreshold ?? 0, item.reorderPoint ?? 0);
      const available = item.quantityOnHand - item.quantityReserved;
      const type: AlertType | null = available <= 0 ? 'out_of_stock' : threshold > 0 && available <= threshold ? 'low_stock' : null;
      if (!type) continue;
      const productId = productIdByVariant.get(item.variantId);
      if (!productId) continue;
      qualifying.push({
        variantId: item.variantId,
        locationId: item.locationId,
        type,
        available,
        threshold,
        negativeStock: item.quantityOnHand < 0,
        productId,
        productName: productNameById.get(productId) ?? productId,
      });
    }

    let active = 0;
    for (const q of qualifying) {
      await this.alerts.findOneAndUpdate(
        { variantId: q.variantId, locationId: q.locationId },
        {
          $set: {
            type: q.type,
            productId: q.productId,
            productName: q.productName,
            available: q.available,
            threshold: q.threshold,
            negativeStock: q.negativeStock,
            resolvedAt: null,
          },
        },
        { upsert: true },
      );
      active += 1;
    }

    const qualifyingKeys = new Set(qualifying.map((q) => `${q.variantId}:${q.locationId}`));
    const openAlerts = await this.alerts.find({ resolvedAt: null }).select({ variantId: 1, locationId: 1 });
    const toResolve = openAlerts.filter((a) => !qualifyingKeys.has(`${a.variantId}:${a.locationId}`)).map((a) => a.id);
    if (toResolve.length) {
      await this.alerts.updateMany({ _id: { $in: toResolve } }, { $set: { resolvedAt: new Date() } });
    }

    this.logger.log(`Low-stock check: ${active} active alert(s), ${toResolve.length} resolved`);
    return { active, resolved: toResolve.length };
  }
}
