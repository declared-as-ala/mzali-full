import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from '@/audit/audit.service';
import { CurrentUser } from '@/auth/current-user.decorator';
import { AuthedRequest, JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { CreateStocktakeDto, SubmitCountDto } from './dto/stocktake.dto';
import { toStocktakeContract } from './stocktake.mapper';
import { StocktakesService } from './stocktakes.service';

@ApiTags('admin/inventory/stocktakes')
@ApiBearerAuth()
@Controller('admin/inventory/stocktakes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StocktakesAdminController {
  constructor(
    private readonly stocktakes: StocktakesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('inventory.read')
  async list(@Query('status') status?: string) {
    const docs = await this.stocktakes.list(status);
    return docs.map((d) => toStocktakeContract(d));
  }

  @Get(':id')
  @RequirePermissions('inventory.read')
  async get(@Param('id') id: string) {
    return toStocktakeContract(await this.stocktakes.getById(id));
  }

  /** What the counting screen loads — omits expectedQuantity when blindCount is on. */
  @Get(':id/count-sheet')
  @RequirePermissions('inventory.adjust')
  async countSheet(@Param('id') id: string) {
    const doc = await this.stocktakes.getById(id);
    return toStocktakeContract(doc, false);
  }

  @Post()
  @RequirePermissions('inventory.adjust')
  async create(@Body() dto: CreateStocktakeDto, @CurrentUser() user: RequestUser, @Req() req: AuthedRequest) {
    const doc = await this.stocktakes.create(dto, { type: 'employee', id: user.userId, name: user.name });
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'inventory.stocktake_start',
      entityType: 'stocktake',
      entityId: doc.id,
      summary: `Inventaire démarré à ${doc.locationId}`,
      ip: req.ip,
    });
    return toStocktakeContract(doc);
  }

  @Post(':id/count')
  @RequirePermissions('inventory.adjust')
  async count(@Param('id') id: string, @Body() dto: SubmitCountDto, @CurrentUser() user: RequestUser) {
    const doc = await this.stocktakes.submitCount(id, dto, { type: 'employee', id: user.userId, name: user.name });
    return toStocktakeContract(doc, false);
  }

  @Post(':id/approve')
  @RequirePermissions('inventory.stocktake_approve')
  async approve(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: AuthedRequest) {
    const doc = await this.stocktakes.approve(id, { type: 'employee', id: user.userId, name: user.name });
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'inventory.stocktake_approve',
      entityType: 'stocktake',
      entityId: doc.id,
      summary: `Inventaire ${doc.stocktakeNumber} approuvé`,
      ip: req.ip,
    });
    return toStocktakeContract(doc);
  }

  @Post(':id/post')
  @RequirePermissions('inventory.stocktake_approve')
  async post(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: AuthedRequest) {
    const doc = await this.stocktakes.post(id, { type: 'employee', id: user.userId, name: user.name });
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'inventory.stocktake_post',
      entityType: 'stocktake',
      entityId: doc.id,
      summary: `Inventaire ${doc.stocktakeNumber} validé — corrections appliquées`,
      ip: req.ip,
    });
    return toStocktakeContract(doc);
  }

  @Post(':id/cancel')
  @RequirePermissions('inventory.adjust')
  async cancel(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    const doc = await this.stocktakes.cancel(id, { type: 'employee', id: user.userId, name: user.name });
    return toStocktakeContract(doc);
  }
}
