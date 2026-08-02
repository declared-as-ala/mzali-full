import { Command, CommandRunner, Option } from 'nest-commander';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Variant } from '@/catalog/variant.schema';
import { SupplierVariantOffer } from '@/suppliers/supplier-variant-offer.schema';
import { writeReport } from '../report-writer';
import { resolvePurchasePriceSource } from '../purchase-price-resolution';

type Options = { dryRun?: boolean };

/**
 * One-time backfill for the new `variants.purchasePriceMinor` field (see
 * the supplier-management simplification: this is now the single manual
 * cost source for margin reporting). For every variant that doesn't have
 * one yet, tries in order:
 *   1. variants.averageCostMinor (goods-receipt weighted average, if any)
 *   2. variants.lastPurchaseCostMinor (last goods-receipt unit cost)
 *   3. The most recently priced supplier_variant_offers row for that
 *      variant (preferred offer wins ties)
 * Nothing is deleted or overwritten — a variant that already has a
 * purchasePriceMinor (whether set by this command before or entered
 * manually) is left untouched, which makes re-running the command a no-op
 * for anything already resolved (idempotent).
 */
@Command({ name: 'migrate:purchase-prices', description: 'Backfill variants.purchasePriceMinor from legacy cost sources' })
export class MigratePurchasePricesCommand extends CommandRunner {
  constructor(
    @InjectModel(Variant.name) private readonly variants: Model<Variant>,
    @InjectModel(SupplierVariantOffer.name) private readonly offers: Model<SupplierVariantOffer>,
  ) {
    super();
  }

  @Option({ flags: '--dry-run', description: 'Report only, write zero data' })
  parseDryRun(): boolean {
    return true;
  }

  async run(_params: string[], options: Options): Promise<void> {
    const report = {
      fromAverageCost: 0,
      fromLastPurchaseCost: 0,
      fromSupplierOffer: 0,
      alreadySet: 0,
      unresolved: [] as { variantId: string; sku: string }[],
    };

    const candidates = await this.variants.find({ purchasePriceMinor: null }).select({ sku: 1, averageCostMinor: 1, lastPurchaseCostMinor: 1 });
    const alreadySet = await this.variants.countDocuments({ purchasePriceMinor: { $ne: null } });
    report.alreadySet = alreadySet;

    for (const variant of candidates) {
      // Only queried when neither legacy cost field is set — cheapest path
      // for the common case, and resolvePurchasePriceSource still re-checks
      // those fields first so behavior matches regardless.
      const needsOfferLookup = variant.averageCostMinor == null && variant.lastPurchaseCostMinor == null;
      const offer = needsOfferLookup
        // Latest valid offer for this variant — preferred offer wins ties,
        // otherwise the most recently priced (updatedAt) offer.
        ? await this.offers.findOne({ variantId: variant.id }).sort({ preferred: -1, lastPurchaseDate: -1, updatedAt: -1 })
        : null;

      const resolution = resolvePurchasePriceSource(
        { averageCostMinor: variant.averageCostMinor, lastPurchaseCostMinor: variant.lastPurchaseCostMinor },
        offer ? { purchasePriceMinor: offer.purchasePriceMinor } : null,
      );

      if (!resolution) {
        report.unresolved.push({ variantId: variant.id, sku: variant.sku });
        continue;
      }

      if (resolution.source === 'average') report.fromAverageCost += 1;
      else if (resolution.source === 'last') report.fromLastPurchaseCost += 1;
      else report.fromSupplierOffer += 1;

      if (!options.dryRun) {
        await this.variants.updateOne({ _id: variant.id }, { $set: { purchasePriceMinor: resolution.priceMinor } });
      }
    }

    const path = await writeReport('migrate-purchase-prices', { options, report });
    console.log(
      `migrate:purchase-prices — fromAverageCost=${report.fromAverageCost} fromLastPurchaseCost=${report.fromLastPurchaseCost} fromSupplierOffer=${report.fromSupplierOffer} alreadySet=${report.alreadySet} unresolved=${report.unresolved.length}${options.dryRun ? ' (dry-run)' : ''}`,
    );
    console.log(`Report: ${path}`);
  }
}
