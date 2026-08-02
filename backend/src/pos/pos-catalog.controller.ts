import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { PosTerminalGuard } from './guards/pos-terminal.guard';
import { PosCatalogService } from './pos-catalog.service';

@ApiTags('pos/catalog')
@ApiBearerAuth()
@Controller('pos/catalog')
@UseGuards(JwtAuthGuard, PosTerminalGuard, PermissionsGuard)
export class PosCatalogController {
  constructor(private readonly catalog: PosCatalogService) {}

  @Get()
  @RequirePermissions('pos.sell')
  get() {
    return this.catalog.getCatalog();
  }
}
