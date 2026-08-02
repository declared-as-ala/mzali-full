import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { UpdateLocationDto } from './dto/update-location.dto';
import { toLocationContract } from './location.mapper';
import { LocationsService } from './locations.service';

@ApiTags('admin/inventory/locations')
@ApiBearerAuth()
@Controller('admin/inventory/locations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LocationsAdminController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  @RequirePermissions('inventory.read')
  async list() {
    const docs = await this.locations.list();
    return docs.map(toLocationContract);
  }

  @Patch(':code')
  @RequirePermissions('inventory.adjust')
  async update(@Param('code') code: string, @Body() dto: UpdateLocationDto) {
    const doc = await this.locations.update(code, dto);
    return toLocationContract(doc);
  }
}
