import { Body, Controller, Delete, Get, Headers, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from '@/audit/audit.service';
import { CurrentUser } from '@/auth/current-user.decorator';
import { JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { roleHasPermission } from '@/auth/permissions';
import { CreateSaleDto } from './dto/create-sale.dto';
import { ListSalesQueryDto } from './dto/list-sales.dto';
import { QuoteSaleDto } from './dto/quote-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { PosTerminalGuard, PosRequest } from './guards/pos-terminal.guard';
import { PosSalesService } from './pos-sales.service';

@ApiTags('pos/sales')
@ApiBearerAuth()
@Controller('pos/sales')
@UseGuards(JwtAuthGuard, PosTerminalGuard, PermissionsGuard)
export class PosSalesController {
  constructor(
    private readonly sales: PosSalesService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @RequirePermissions('pos.sell')
  async create(
    @Body() dto: CreateSaleDto,
    @CurrentUser() user: RequestUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() posReq: PosRequest,
  ) {
    const { doc, wasExisting } = await this.sales.create(
      dto,
      {
        terminalId: posReq.posTerminalId!,
        locationId: posReq.posLocationId!,
        cashierId: user.userId,
        cashierName: user.name,
        cashierRole: user.role,
      },
      idempotencyKey,
    );
    if (!wasExisting) {
      await this.audit.log({
        actor: { type: 'employee', id: user.userId, name: user.name },
        action: 'pos.sale.create',
        entityType: 'pos_sale',
        entityId: doc.id,
        summary: `Vente #${doc.saleNumber} (${doc.totalMinor} millimes)`,
        ip: posReq.ip,
        locationId: posReq.posLocationId ?? null,
      });
    }
    return this.sales.toContract(doc, user.name);
  }

  /** Live pricing preview for the cart-in-progress — no stock/session
   *  side effects, called on every cart edit so the till screen shows the
   *  authoritative offer-adjusted total without pricing anything client-side. */
  @Post('quote')
  @RequirePermissions('pos.sell')
  async quote(@Body() dto: QuoteSaleDto) {
    return this.sales.quote(dto.lines);
  }

  @Get(':id/ticket')
  @RequirePermissions('pos.sell')
  async ticket(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    const doc = await this.sales.getById(id);
    if (!doc) throw new NotFoundException('Vente introuvable');
    return await this.sales.toContract(doc, user.name);
  }

  /** A cashier without `pos.view_reports` only ever sees their own
   *  tickets — same self-scoping shape as the order-management module's
   *  employee-scoped endpoints. Store managers (who hold `pos.view_reports`)
   *  see every sale, matching "cashier or manager can see all POS sales". */
  @Get()
  @RequirePermissions('pos.sell')
  async list(@Query() query: ListSalesQueryDto, @CurrentUser() user: RequestUser) {
    const canViewAll = roleHasPermission(user.role, 'pos.view_reports');
    return this.sales.listContracts({
      page: query.page,
      perPage: query.perPage,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      status: query.status,
      search: query.search,
      cashierId: query.cashierId,
      scopeToCashierId: canViewAll ? undefined : user.userId,
    });
  }

  /** Authorized users only (store_manager) — see pos-sales.service.ts's
   *  update() for the session-open guard and stock-delta rules. */
  @Patch(':id')
  @RequirePermissions('pos.edit_sale')
  async update(@Param('id') id: string, @Body() dto: UpdateSaleDto, @CurrentUser() user: RequestUser, @Req() posReq: PosRequest) {
    const { before, after } = await this.sales.update(id, dto, { type: 'employee', id: user.userId, name: user.name });
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'pos.sale.update',
      entityType: 'pos_sale',
      entityId: after.id,
      summary: `Vente #${after.saleNumber} modifiée — ${dto.reason}`,
      before: { lines: before.lines, totalMinor: before.totalMinor, customerId: before.customerId, notes: before.notes },
      after: { lines: after.lines, totalMinor: after.totalMinor, customerId: after.customerId, notes: after.notes },
      ip: posReq.ip,
      locationId: posReq.posLocationId ?? null,
    });
    return this.sales.toContract(after, user.name);
  }

  @Delete(':id')
  @RequirePermissions('pos.cancel_sale')
  async delete(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() posReq: PosRequest) {
    const doc = await this.sales.cancel(id, { type: 'employee', id: user.userId, name: user.name });
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'pos.sale.delete',
      entityType: 'pos_sale',
      entityId: doc.id,
      summary: `Vente #${doc.saleNumber} annulée/supprimée`,
      ip: posReq.ip,
      locationId: posReq.posLocationId ?? null,
    });
    return { ok: true, id: doc.id, status: doc.status };
  }
}
