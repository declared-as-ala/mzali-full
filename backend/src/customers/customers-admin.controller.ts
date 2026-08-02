import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { CustomersService } from './customers.service';

@ApiTags('admin/customers')
@ApiBearerAuth()
@Controller('admin/customers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomersAdminController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermissions('customers.read')
  list(@Query('page') page?: string, @Query('perPage') perPage?: string, @Query('search') search?: string) {
    return this.customers.list(page ? Number(page) : undefined, perPage ? Number(perPage) : undefined, search);
  }

  @Post('bulk-delete')
  @RequirePermissions('customers.delete')
  async bulkDelete(@Body() body: { ids?: unknown }) {
    if (!Array.isArray(body.ids) || body.ids.length === 0 || body.ids.length > 100 || body.ids.some((id) => typeof id !== 'string')) {
      throw new BadRequestException('Une liste de 1 à 100 clients est requise');
    }
    const count = await this.customers.deleteMany(body.ids);
    return { count };
  }
}
