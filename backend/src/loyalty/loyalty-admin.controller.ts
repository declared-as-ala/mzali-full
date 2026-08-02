import { Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { toAccountContract, toTransactionContract } from './loyalty.mapper';
import { LoyaltyService } from './loyalty.service';

@ApiTags('admin/loyalty')
@ApiBearerAuth()
@Controller('admin/loyalty')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LoyaltyAdminController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('accounts')
  @RequirePermissions('loyalty.manage')
  async list(@Query('search') search?: string, @Query('page') page?: string, @Query('perPage') perPage?: string) {
    const result = await this.loyalty.listAdmin(search, page ? Number(page) : undefined, perPage ? Number(perPage) : undefined);
    return { ...result, items: result.items.map((row) => toAccountContract(row.doc, row.customer)) };
  }

  @Get('accounts/:id/transactions')
  @RequirePermissions('loyalty.manage')
  async transactions(@Param('id') id: string, @Query('page') page?: string, @Query('perPage') perPage?: string) {
    const account = await this.loyalty.getById(id);
    if (!account) throw new NotFoundException('Compte de fidélité introuvable');
    const result = await this.loyalty.listTransactions(id, page ? Number(page) : undefined, perPage ? Number(perPage) : undefined);
    return { ...result, items: result.items.map(toTransactionContract) };
  }

  @Post('accounts/:id/suspend')
  @RequirePermissions('loyalty.manage')
  async suspend(@Param('id') id: string) {
    const account = await this.loyalty.suspend(id);
    return toAccountContract(account);
  }
}
