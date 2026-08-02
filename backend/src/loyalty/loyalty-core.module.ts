import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Customer, CustomerSchema } from '@/customers/customer.schema';
import { CustomersService } from '@/customers/customers.service';
import { Media, MediaSchema } from '@/media/media.schema';
import { MediaService } from '@/media/media.service';
import { minioClientProvider } from '@/media/minio.provider';
import { SettingsCoreModule } from '@/settings/settings-core.module';
import { Employee, EmployeeSchema } from '@/users/employee.schema';
import { LoyaltyAccount, LoyaltyAccountSchema } from './loyalty-account.schema';
import { LoyaltyCardBatch, LoyaltyCardBatchSchema } from './loyalty-card-batch.schema';
import { LoyaltyCardExportService } from './loyalty-card-export.service';
import { LoyaltyCardPdfService } from './loyalty-card-pdf.service';
import { LoyaltyCardPngService } from './loyalty-card-png.service';
import { LoyaltyCard, LoyaltyCardSchema } from './loyalty-card.schema';
import { LoyaltyCardsService } from './loyalty-cards.service';
import { LoyaltyLedgerService } from './loyalty-ledger.service';
import { LoyaltyRulesService } from './loyalty-rules.service';
import { LoyaltyTransaction, LoyaltyTransactionSchema } from './loyalty-transaction.schema';
import { LoyaltyService } from './loyalty.service';

const LoyaltyMongoose = MongooseModule.forFeature([
  { name: LoyaltyAccount.name, schema: LoyaltyAccountSchema },
  { name: LoyaltyTransaction.name, schema: LoyaltyTransactionSchema },
  { name: LoyaltyCard.name, schema: LoyaltyCardSchema },
  { name: LoyaltyCardBatch.name, schema: LoyaltyCardBatchSchema },
  // Registered directly (not by importing CustomersModule/UsersModule/
  // MediaModule, which carry controllers guarded by JwtAuthGuard) so this
  // module stays safe for worker-side jobs — same pattern as
  // PosCoreModule/DocumentsWorkerModule.
  { name: Customer.name, schema: CustomerSchema },
  { name: Employee.name, schema: EmployeeSchema },
  { name: Media.name, schema: MediaSchema },
]);

@Module({
  imports: [LoyaltyMongoose, SettingsCoreModule],
  providers: [
    CustomersService, LoyaltyLedgerService, LoyaltyRulesService, LoyaltyCardsService, LoyaltyService,
    MediaService, minioClientProvider, LoyaltyCardPdfService, LoyaltyCardPngService, LoyaltyCardExportService,
  ],
  exports: [
    LoyaltyMongoose, SettingsCoreModule, CustomersService,
    LoyaltyLedgerService, LoyaltyRulesService, LoyaltyCardsService, LoyaltyService,
    LoyaltyCardPdfService, LoyaltyCardPngService, LoyaltyCardExportService,
    MediaService, minioClientProvider,
  ],
})
export class LoyaltyCoreModule {}
