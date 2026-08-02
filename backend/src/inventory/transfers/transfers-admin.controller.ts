import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { AuditService } from '@/audit/audit.service';
import { CurrentUser } from '@/auth/current-user.decorator';
import { AuthedRequest, JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { ApproveTransferDto, CreateTransferDto, ReceiveTransferDto } from './dto/transfer.dto';
import { toTransferContract } from './transfer.mapper';
import { TransfersService } from './transfers.service';

class CancelTransferDto {
  @IsOptional() @IsString() note?: string;
}

@ApiTags('admin/inventory/transfers')
@ApiBearerAuth()
@Controller('admin/inventory/transfers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TransfersAdminController {
  constructor(
    private readonly transfers: TransfersService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('inventory.read')
  async list(@Query('status') status?: string) {
    const docs = await this.transfers.list(status);
    return docs.map(toTransferContract);
  }

  @Get(':id')
  @RequirePermissions('inventory.read')
  async get(@Param('id') id: string) {
    return toTransferContract(await this.transfers.getById(id));
  }

  @Post()
  @RequirePermissions('pos.request_transfer')
  async create(@Body() dto: CreateTransferDto, @CurrentUser() user: RequestUser, @Req() req: AuthedRequest) {
    const doc = await this.transfers.create(dto, { type: 'employee', id: user.userId, name: user.name });
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'inventory.transfer_request',
      entityType: 'stock_transfer',
      entityId: doc.id,
      summary: `Transfert demandé ${doc.sourceLocationId} → ${doc.destinationLocationId}`,
      ip: req.ip,
    });
    return toTransferContract(doc);
  }

  @Post(':id/approve')
  @RequirePermissions('inventory.transfer_approve')
  async approve(@Param('id') id: string, @Body() dto: ApproveTransferDto, @CurrentUser() user: RequestUser, @Req() req: AuthedRequest) {
    const doc = await this.transfers.approve(id, dto, { type: 'employee', id: user.userId, name: user.name });
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'inventory.transfer_approve',
      entityType: 'stock_transfer',
      entityId: doc.id,
      summary: `Transfert ${doc.id} approuvé`,
      ip: req.ip,
    });
    return toTransferContract(doc);
  }

  @Post(':id/ship')
  @RequirePermissions('inventory.transfer_approve')
  async ship(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: AuthedRequest) {
    const doc = await this.transfers.ship(id, { type: 'employee', id: user.userId, name: user.name });
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'inventory.transfer_ship',
      entityType: 'stock_transfer',
      entityId: doc.id,
      summary: `Transfert ${doc.id} expédié`,
      ip: req.ip,
    });
    return toTransferContract(doc);
  }

  @Post(':id/receive')
  @RequirePermissions('inventory.transfer_approve')
  async receive(@Param('id') id: string, @Body() dto: ReceiveTransferDto, @CurrentUser() user: RequestUser, @Req() req: AuthedRequest) {
    const doc = await this.transfers.receive(id, dto, { type: 'employee', id: user.userId, name: user.name });
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'inventory.transfer_receive',
      entityType: 'stock_transfer',
      entityId: doc.id,
      summary: `Transfert ${doc.id} réceptionné (${doc.status})`,
      ip: req.ip,
    });
    return toTransferContract(doc);
  }

  @Post(':id/cancel')
  @RequirePermissions('inventory.transfer_approve')
  async cancel(@Param('id') id: string, @Body() dto: CancelTransferDto, @CurrentUser() user: RequestUser, @Req() req: AuthedRequest) {
    const doc = await this.transfers.cancel(id, { type: 'employee', id: user.userId, name: user.name }, dto.note);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'inventory.transfer_cancel',
      entityType: 'stock_transfer',
      entityId: doc.id,
      summary: `Transfert ${doc.id} ${doc.status === 'REJECTED' ? 'rejeté' : 'annulé'}`,
      ip: req.ip,
    });
    return toTransferContract(doc);
  }
}
