import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LocationsCoreModule } from '@/catalog/locations-core.module';
import { SettingsCoreModule } from '@/settings/settings-core.module';
import { OnlineAvailabilityService } from './online-availability.service';
import { StockItem, StockItemSchema } from './stock-item.schema';
import { StockLedgerService } from './stock-ledger.service';
import { StockMovement, StockMovementSchema } from './stock-movement.schema';

const StockMongoose = MongooseModule.forFeature([
  { name: StockItem.name, schema: StockItemSchema },
  { name: StockMovement.name, schema: StockMovementSchema },
]);

/**
 * Schemas + StockLedgerService only — no controllers, no auth-guard
 * dependency. Imported by both the API's InventoryModule (adds the admin
 * controller) and, from Sprint 5 (transfers) onward, worker processors —
 * so the worker never has to load JwtAuthGuard/JwtService just to move
 * stock. Same pattern as ShippingCoreModule. Also re-exports
 * LocationsCoreModule so InventoryService can resolve the default
 * online/POS location codes without a hardcoded constant, and
 * SettingsCoreModule so OnlineAvailabilityService can read the stock
 * policy — both explicit imports rather than relying on `@Global()`,
 * which only helps within a module graph that loaded the full module
 * somewhere (the worker's root module never loads SettingsModule).
 */
@Module({
  imports: [StockMongoose, LocationsCoreModule, SettingsCoreModule],
  providers: [StockLedgerService, OnlineAvailabilityService],
  exports: [StockLedgerService, OnlineAvailabilityService, StockMongoose, LocationsCoreModule, SettingsCoreModule],
})
export class InventoryCoreModule {}
