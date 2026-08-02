import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from '@/audit/audit.service';
import { CurrentUser } from '@/auth/current-user.decorator';
import { AuthedRequest, JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { CouponsService } from './coupons.service';
import { CreateCouponDto, UpdateCouponDto } from './dto/coupon.dto';

@ApiTags('admin/coupons')
@ApiBearerAuth()
@Controller('admin/coupons')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CouponsAdminController {
  constructor(
    private readonly coupons: CouponsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('coupons.read')
  list() {
    return this.coupons.list();
  }

  @Post()
  @RequirePermissions('coupons.write')
  async create(@Body() dto: CreateCouponDto, @CurrentUser() user: RequestUser, @Req() req: AuthedRequest) {
    const created = await this.coupons.create(dto);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'coupon.create',
      entityType: 'coupon',
      entityId: created.id,
      summary: `Création du code promo ${created.code}`,
      ip: req.ip,
    });
    return created;
  }

  @Put(':id')
  @RequirePermissions('coupons.write')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCouponDto,
    @CurrentUser() user: RequestUser,
    @Req() req: AuthedRequest,
  ) {
    const updated = await this.coupons.update(id, dto);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'coupon.update',
      entityType: 'coupon',
      entityId: id,
      summary: `Mise à jour du code promo ${updated.code}`,
      ip: req.ip,
    });
    return updated;
  }

  @Delete(':id')
  @RequirePermissions('coupons.write')
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: AuthedRequest) {
    await this.coupons.remove(id);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'coupon.delete',
      entityType: 'coupon',
      entityId: id,
      summary: `Suppression du code promo ${id}`,
      ip: req.ip,
    });
    return { ok: true };
  }
}
