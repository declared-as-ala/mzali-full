import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from '@/audit/audit.service';
import { CurrentUser } from '@/auth/current-user.decorator';
import { AuthedRequest, JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@ApiTags('admin/categories')
@ApiBearerAuth()
@Controller('admin/categories')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CategoriesAdminController {
  constructor(
    private readonly categories: CategoriesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('categories.read')
  list() {
    return this.categories.list();
  }

  @Post()
  @RequirePermissions('categories.write')
  async create(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() user: RequestUser,
    @Req() req: AuthedRequest,
  ) {
    const created = await this.categories.create(dto);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'category.create',
      entityType: 'category',
      entityId: created.id,
      summary: `Création de la catégorie ${created.name}`,
      ip: req.ip,
    });
    return created;
  }

  @Put(':id')
  @RequirePermissions('categories.write')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: RequestUser,
    @Req() req: AuthedRequest,
  ) {
    const updated = await this.categories.update(id, dto);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'category.update',
      entityType: 'category',
      entityId: id,
      summary: `Mise à jour de la catégorie ${updated.name}`,
      ip: req.ip,
    });
    return updated;
  }

  @Delete(':id')
  @RequirePermissions('categories.write')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: AuthedRequest,
  ) {
    await this.categories.remove(id);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'category.delete',
      entityType: 'category',
      entityId: id,
      summary: `Suppression de la catégorie ${id}`,
      ip: req.ip,
    });
    return { ok: true };
  }
}
