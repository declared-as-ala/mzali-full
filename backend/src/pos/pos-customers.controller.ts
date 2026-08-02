import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { PosTerminalGuard } from './guards/pos-terminal.guard';
import { PosCustomersService } from './pos-customers.service';

@ApiTags('pos/customers')
@ApiBearerAuth()
@Controller('pos/customers')
@UseGuards(JwtAuthGuard, PosTerminalGuard, PermissionsGuard)
export class PosCustomersController {
  constructor(private readonly customers: PosCustomersService) {}

  @Get(':customerId/summary')
  @RequirePermissions('loyalty.view')
  async summary(@Param('customerId') customerId: string) {
    return this.customers.summary(customerId);
  }
}
