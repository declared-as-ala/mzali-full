import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Model } from 'mongoose';
import { AuditService } from '@/audit/audit.service';
import { CurrentUser } from '@/auth/current-user.decorator';
import { AuthedRequest, JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { ReportQueryDto } from './dto/session.dto';
import { PosCashMovement } from './pos-cash-movement.schema';
import { PosPayment } from './pos-payment.schema';
import { PosSale } from './pos-sale.schema';
import { toPosSessionContract } from './pos-session.mapper';
import { PosSessionsService } from './pos-sessions.service';

class ReviewSessionDto {
  @IsOptional() @IsString() note?: string;
}

@ApiTags('admin/pos/sessions')
@ApiBearerAuth()
@Controller('admin/pos/sessions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PosSessionsAdminController {
  constructor(
    private readonly sessions: PosSessionsService,
    @InjectModel(PosSale.name) private readonly sales: Model<PosSale>,
    @InjectModel(PosPayment.name) private readonly payments: Model<PosPayment>,
    @InjectModel(PosCashMovement.name) private readonly cashMovements: Model<PosCashMovement>,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('pos.sessions.read')
  async list(
    @Query('cashierId') cashierId?: string,
    @Query('terminalId') terminalId?: string,
    @Query('status') status?: string,
  ) {
    const docs = await this.sessions.list({ cashierId, terminalId, status });
    return docs.map(toPosSessionContract);
  }

  @Get(':id')
  @RequirePermissions('pos.sessions.read')
  async get(@Param('id') id: string) {
    return toPosSessionContract(await this.sessions.getById(id));
  }

  @Get(':id/report')
  @RequirePermissions('pos.sessions.read')
  async report(@Param('id') id: string, @Query() query: ReportQueryDto) {
    return this.sessions.report(id, query.type ?? 'Z');
  }

  @Get(':id/sales')
  @RequirePermissions('pos.sessions.read')
  async sessionSales(@Param('id') id: string) {
    return this.sales.find({ sessionId: id }).sort({ createdAt: -1 });
  }

  @Get(':id/payments')
  @RequirePermissions('pos.sessions.read')
  async sessionPayments(@Param('id') id: string) {
    return this.payments.find({ sessionId: id }).sort({ receivedAt: -1 });
  }

  @Get(':id/cash-movements')
  @RequirePermissions('pos.sessions.read')
  async sessionCashMovements(@Param('id') id: string) {
    return this.cashMovements.find({ sessionId: id }).sort({ createdAt: -1 });
  }

  @Post(':id/review')
  @RequirePermissions('pos.sessions.review')
  async review(@Param('id') id: string, @Body() dto: ReviewSessionDto, @CurrentUser() user: RequestUser, @Req() req: AuthedRequest) {
    const doc = await this.sessions.markReviewed(id, user.name, dto.note);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'pos.session.review',
      entityType: 'pos_cashier_session',
      entityId: doc.id,
      summary: `Session vérifiée par ${user.name}`,
      ip: req.ip,
    });
    return toPosSessionContract(doc);
  }
}
