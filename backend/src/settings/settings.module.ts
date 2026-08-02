import { Global, Module } from '@nestjs/common';
import { SettingsAdminController } from './settings-admin.controller';
import { SettingsCoreModule } from './settings-core.module';

@Global()
@Module({
  imports: [SettingsCoreModule],
  controllers: [SettingsAdminController],
  exports: [SettingsCoreModule],
})
export class SettingsModule {}
