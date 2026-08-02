import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Location, LocationSchema } from './location.schema';
import { LocationsService } from './locations.service';

const LocationsMongoose = MongooseModule.forFeature([{ name: Location.name, schema: LocationSchema }]);

/**
 * Schema + service only — no controllers, no auth-guard dependency.
 * Imported by both the API's LocationsModule (adds the admin controller)
 * and, from Sprint 5 onward, the worker's transfer processor, so the
 * worker never has to load JwtAuthGuard/JwtService just to resolve a
 * location code. Same pattern as ShippingCoreModule.
 */
@Module({
  imports: [LocationsMongoose],
  providers: [LocationsService],
  exports: [LocationsService, LocationsMongoose],
})
export class LocationsCoreModule {}
