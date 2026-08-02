import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '@/orders/order.schema';
import { PurchaseOrder, PurchaseOrderSchema } from '@/purchase-orders/purchase-order.schema';
import { PosAlertsService } from './pos-alerts.service';
import { PosAnalyticsAdminController } from './pos-analytics-admin.controller';
import { PosAnalyticsService } from './pos-analytics.service';
import { PosReportExportService } from './pos-report-export.service';
import { PosCatalogController } from './pos-catalog.controller';
import { PosCoreModule } from './pos-core.module';
import { PosCustomersController } from './pos-customers.controller';
import { PosCustomersService } from './pos-customers.service';
import { PosDashboardController } from './pos-dashboard.controller';
import { PosDashboardService } from './pos-dashboard.service';
import { PosEventsController } from './pos-events.controller';
import { PosLostSalesController } from './pos-lost-sales.controller';
import { PosLostSalesService } from './pos-lost-sales.service';
import { PosLoyaltyController } from './pos-loyalty.controller';
import { PosSalesController } from './pos-sales.controller';
import { PosSessionsAdminController } from './pos-sessions-admin.controller';
import { PosSessionsController } from './pos-sessions.controller';
import { PosSuggestionsController } from './pos-suggestions.controller';
import { PosSuggestionsService } from './pos-suggestions.service';
import { PosTerminalsAdminController } from './pos-terminals-admin.controller';
import { PosTerminalsController } from './pos-terminals.controller';
import { PosTerminalGuard } from './guards/pos-terminal.guard';

// Read-only cross-channel reporting needs Order/PurchaseOrder models that
// PosCoreModule doesn't carry (it deliberately avoids importing OrdersModule
// to stay worker-safe) — registered directly here, same pattern as
// PosCoreModule's own direct Product/Category/Variant registration.
const ReportingMongoose = MongooseModule.forFeature([
  { name: Order.name, schema: OrderSchema },
  { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
]);

@Module({
  imports: [PosCoreModule, ReportingMongoose],
  controllers: [
    PosTerminalsController,
    PosTerminalsAdminController,
    PosCatalogController,
    PosSalesController,
    PosLoyaltyController,
    PosSessionsController,
    PosSessionsAdminController,
    PosEventsController,
    PosAnalyticsAdminController,
    PosLostSalesController,
    PosDashboardController,
    PosCustomersController,
    PosSuggestionsController,
  ],
  providers: [
    PosTerminalGuard, PosAnalyticsService, PosAlertsService, PosReportExportService, PosLostSalesService,
    PosDashboardService, PosCustomersService, PosSuggestionsService,
  ],
})
export class PosModule {}
