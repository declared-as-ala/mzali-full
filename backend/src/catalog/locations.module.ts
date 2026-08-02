import { Module } from '@nestjs/common';
import { LocationsAdminController } from './locations-admin.controller';
import { LocationsCoreModule } from './locations-core.module';

@Module({
  imports: [LocationsCoreModule],
  controllers: [LocationsAdminController],
  exports: [LocationsCoreModule],
})
export class LocationsModule {}
