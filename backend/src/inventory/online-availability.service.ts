import { Injectable } from '@nestjs/common';
import type { StockPolicy } from '@contracts';
import { LocationsService } from '@/catalog/locations.service';
import { SettingsService } from '@/settings/settings.service';
import { StockLedgerService } from './stock-ledger.service';

/**
 * The single place "is this variant buyable online, and how many" gets
 * decided — every online-facing read path goes through this instead of
 * re-deciding location routing itself. See
 * docs/pos-platform/inventory-architecture.md §"Stock policy".
 */
@Injectable()
export class OnlineAvailabilityService {
  constructor(
    private readonly ledger: StockLedgerService,
    private readonly locations: LocationsService,
    private readonly settings: SettingsService,
  ) {}

  /** Available (onHand - reserved, floored at 0) quantity for a variant, under the current stock policy. */
  async resolve(variantId: string): Promise<number> {
    const { stockPolicy } = await this.settings.getInventorySettings();
    return this.resolveWithPolicy(variantId, stockPolicy);
  }

  async resolveWithPolicy(variantId: string, policy: StockPolicy): Promise<number> {
    const depotCode = await this.locations.getDefaultOnlineLocationCode();
    const boutiqueCode = await this.locations.getDefaultPosLocationCode();

    switch (policy) {
      case 'BOUTIQUE_ONLY': {
        const item = await this.ledger.stockAt(variantId, boutiqueCode);
        return this.available(item);
      }
      case 'COMBINED_LOCATIONS': {
        const [depot, boutique] = await Promise.all([
          this.ledger.stockAt(variantId, depotCode),
          this.ledger.stockAt(variantId, boutiqueCode),
        ]);
        return this.available(depot) + this.available(boutique);
      }
      case 'PRIORITY_LOCATIONS': {
        const depot = await this.ledger.stockAt(variantId, depotCode);
        const depotAvailable = this.available(depot);
        if (depotAvailable > 0) return depotAvailable;
        const boutique = await this.ledger.stockAt(variantId, boutiqueCode);
        return this.available(boutique);
      }
      case 'DEPOT_ONLY':
      default: {
        const item = await this.ledger.stockAt(variantId, depotCode);
        return this.available(item);
      }
    }
  }

  private available(item: { quantityOnHand: number; quantityReserved: number } | null): number {
    return item ? Math.max(0, item.quantityOnHand - item.quantityReserved) : 0;
  }
}
