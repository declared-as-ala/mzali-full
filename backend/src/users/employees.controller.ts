import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from '@/audit/audit.service';
import { CurrentUser } from '@/auth/current-user.decorator';
import { AuthedRequest, JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';
import { UsersService } from './users.service';

@ApiTags('admin/employees')
@ApiBearerAuth()
@Controller('admin/employees')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmployeesController {
  constructor(
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('employees.read')
  list() {
    return this.users.list();
  }

  @Post()
  @RequirePermissions('employees.manage')
  async create(
    @Body() dto: CreateEmployeeDto,
    @CurrentUser() user: RequestUser,
    @Req() req: AuthedRequest,
  ) {
    const created = await this.users.create(dto);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'employee.create',
      entityType: 'employee',
      entityId: created.id,
      summary: `Création de l'employé ${created.name} (${created.email})`,
      after: { name: created.name, email: created.email, role: created.role },
      ip: req.ip,
    });
    return created;
  }

  @Get(':id')
  @RequirePermissions('employees.read')
  get(@Param('id') id: string) {
    return this.users.get(id);
  }

  @Patch(':id')
  @RequirePermissions('employees.manage')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() user: RequestUser,
    @Req() req: AuthedRequest,
  ) {
    // Parity with the legacy console: you cannot deactivate yourself.
    if (id === user.userId && dto.active === false) {
      throw new BadRequestException('Impossible de désactiver votre propre compte');
    }
    const before = await this.users.get(id);
    const updated = await this.users.update(id, dto);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'employee.update',
      entityType: 'employee',
      entityId: id,
      summary: `Mise à jour de l'employé ${updated.name}`,
      before: { name: before.name, email: before.email, role: before.role, active: before.active },
      after: { name: updated.name, email: updated.email, role: updated.role, active: updated.active },
      ip: req.ip,
    });
    return updated;
  }

  @Delete(':id')
  @RequirePermissions('employees.manage')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: AuthedRequest,
  ) {
    // Parity with the legacy console: you cannot delete yourself.
    if (id === user.userId) {
      throw new BadRequestException('Impossible de supprimer votre propre compte');
    }
    const before = await this.users.get(id);
    await this.users.remove(id);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'employee.delete',
      entityType: 'employee',
      entityId: id,
      summary: `Suppression de l'employé ${before.name} (${before.email})`,
      before: { name: before.name, email: before.email, role: before.role },
      ip: req.ip,
    });
    return { ok: true };
  }
}
