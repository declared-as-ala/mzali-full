import { Injectable } from '@nestjs/common';
import { LocationsService } from '@/catalog/locations.service';
import { SettingsService } from '@/settings/settings.service';
import { StockLedgerService } from './stock-ledger.service';

/**
 * The single place "how many can be sold" gets decided for read paths. There is
 * ONE operational inventory (DEPOT): website, admin orders and POS all read
 * the same quantity, so nothing here routes between locations any more.
 */
@Injectable()
export class OnlineAvailabilityService {
  constructor(
    private readonly ledger: StockLedgerService,
    private readonly locations: LocationsService,
    private readonly settings: SettingsService,
  ) {}

  /** Available (onHand - reserved, floored at 0) quantity for a variant. */
  async resolve(variantId: string): Promise<number> {
    const depot = await this.locations.getDefaultOnlineLocationCode();
    return this.available(await this.ledger.stockAt(variantId, depot));
  }

  async resolveMany(ids: string[]) {
    const depot = await this.locations.getDefaultOnlineLocationCode();
    const rows = await this.ledger.stockForVariants(ids, depot);
    return new Map(rows.map(r => [r.variantId, this.available(r)]));
  }

  async enabled() { return (await this.settings.getInventorySettings()).enabled !== false; }

  private available(item: { quantityOnHand: number; quantityReserved: number } | null): number {
    return item ? Math.max(0, item.quantityOnHand - item.quantityReserved) : 0;
  }
}
