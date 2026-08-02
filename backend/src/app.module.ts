import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { AuditAdminModule } from './audit/audit-admin.module';
import { JobsModule } from './jobs/jobs.module';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';
import { AuthController } from './auth/auth.controller';
import { CatalogModule } from './catalog/catalog.module';
import { LocationsModule } from './catalog/locations.module';
import { MediaModule } from './media/media.module';
import { InventoryModule } from './inventory/inventory.module';
import { TransfersModule } from './inventory/transfers/transfers.module';
import { StocktakesModule } from './inventory/stocktakes/stocktakes.module';
import { CustomersModule } from './customers/customers.module';
import { CouponsModule } from './coupons/coupons.module';
import { SettingsModule } from './settings/settings.module';
import { OrdersModule } from './orders/orders.module';
import { PosModule } from './pos/pos.module';
import { ShippingModule } from './shipping/shipping.module';
import { StatsModule } from './stats/stats.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { QuotesModule } from './quotes/quotes.module';
import { InvoicesModule } from './invoices/invoices.module';
import { LoyaltyModule } from './loyalty/loyalty.module';

/** API composition root (HTTP process). */
@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId: (req) => (req.headers['x-request-id'] as string) ?? randomUUID(),
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-service-token"]',
          ],
          censor: '[REDACTED]',
        },
        autoLogging: {
          ignore: (req) => (req.url ?? '').startsWith('/health'),
        },
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      },
    }),
    DatabaseModule,
    RedisModule,
    AuthModule,
    AuditModule,
    AuditAdminModule,
    JobsModule,
    UsersModule,
    HealthModule,
    CatalogModule,
    LocationsModule,
    MediaModule,
    InventoryModule,
    TransfersModule,
    StocktakesModule,
    CustomersModule,
    CouponsModule,
    SettingsModule,
    OrdersModule,
    PosModule,
    ShippingModule,
    StatsModule,
    SuppliersModule,
    QuotesModule,
    InvoicesModule,
    LoyaltyModule,
  ],
  controllers: [AuthController],
})
export class AppModule {}
