import { Module } from '@nestjs/common';
import { LoyaltyAdminController } from './loyalty-admin.controller';
import { LoyaltyCardsAdminController } from './loyalty-cards-admin.controller';
import { LoyaltyCoreModule } from './loyalty-core.module';
import { LoyaltyPublicController } from './loyalty-public.controller';
import { LoyaltyController } from './loyalty.controller';

@Module({
  imports: [LoyaltyCoreModule],
  controllers: [LoyaltyController, LoyaltyAdminController, LoyaltyPublicController, LoyaltyCardsAdminController],
})
export class LoyaltyModule {}
