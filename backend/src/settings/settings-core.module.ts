import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Setting, SettingSchema } from './settings.schema';
import { SettingsService } from './settings.service';

const SettingsMongoose = MongooseModule.forFeature([{ name: Setting.name, schema: SettingSchema }]);

/**
 * Schema + SettingsService only — no controller, no auth-guard dependency.
 * `SettingsModule` (the API's `@Global()` module) imports this and adds
 * the admin controller; any worker-side consumer that needs
 * SettingsService (e.g. InventoryCoreModule's OnlineAvailabilityService)
 * imports this directly instead of relying on `@Global()`, which only
 * takes effect within a module graph that actually loaded SettingsModule
 * somewhere — the worker's root module never did. Same pattern as
 * LocationsCoreModule/InventoryCoreModule.
 */
@Module({
  imports: [SettingsMongoose],
  providers: [SettingsService],
  exports: [SettingsService, SettingsMongoose],
})
export class SettingsCoreModule {}
