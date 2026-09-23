import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from '@/audit/audit.service';
import { CurrentUser } from '@/auth/current-user.decorator';
import { JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { AttendanceService } from './attendance.service';
import { CreateAttendanceEmployeeDto, ResetPinDto, UpdateAttendanceEmployeeDto } from './dto/attendance-employee.dto';
import { toAttendanceEmployeeRecord } from './attendance.mapper';

/** Admin CRUD for the isolated Pointage employee roster — never the
 *  login/POS Employee (see attendance-employee.schema.ts's doc). */
@ApiTags('admin/attendance-employees')
@ApiBearerAuth()
@Controller('admin/attendance-employees')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttendanceEmployeesAdminController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('attendance.view')
  async list() {
    const docs = await this.attendance.listEmployees();
    return docs.map(toAttendanceEmployeeRecord);
  }

  @Get(':id')
  @RequirePermissions('attendance.view')
  async get(@Param('id') id: string) {
    return toAttendanceEmployeeRecord(await this.attendance.getEmployee(id));
  }

  @Post()
  @RequirePermissions('attendance.employees.manage')
  async create(@Body() dto: CreateAttendanceEmployeeDto, @CurrentUser() user: RequestUser) {
    const doc = await this.attendance.createEmployee(dto);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'attendance.employee.create',
      entityType: 'attendance_employee',
      entityId: doc.id,
      summary: `Employé pointage créé : ${doc.firstName} ${doc.lastName}`,
      after: { firstName: doc.firstName, lastName: doc.lastName, hourlyRateMinor: doc.hourlyRateMinor },
      ip: null,
    });
    return toAttendanceEmployeeRecord(doc);
  }

  @Put(':id')
  @RequirePermissions('attendance.employees.manage')
  async update(@Param('id') id: string, @Body() dto: UpdateAttendanceEmployeeDto, @CurrentUser() user: RequestUser) {
    const before = await this.attendance.getEmployee(id);
    const doc = await this.attendance.updateEmployee(id, dto);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: before.active !== doc.active ? (doc.active ? 'attendance.employee.activate' : 'attendance.employee.deactivate') : 'attendance.employee.update',
      entityType: 'attendance_employee',
      entityId: doc.id,
      summary: `Employé pointage modifié : ${doc.firstName} ${doc.lastName}`,
      before: { active: before.active, hourlyRateMinor: before.hourlyRateMinor },
      after: { active: doc.active, hourlyRateMinor: doc.hourlyRateMinor },
      ip: null,
    });
    return toAttendanceEmployeeRecord(doc);
  }

  /** Never returns the PIN — only replaces it. See #8. */
  @Post(':id/reset-pin')
  @RequirePermissions('attendance.employees.manage')
  async resetPin(@Param('id') id: string, @Body() dto: ResetPinDto, @CurrentUser() user: RequestUser) {
    await this.attendance.resetPin(id, dto.pin);
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'attendance.employee.pin_reset',
      entityType: 'attendance_employee',
      entityId: id,
      summary: 'Code PIN réinitialisé',
      ip: null,
    });
    return { ok: true };
  }

  /** Deactivate, never delete — history (sessions/payments) must survive. See #28. */
  @Delete(':id')
  @RequirePermissions('attendance.employees.manage')
  async deactivate(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    const doc = await this.attendance.updateEmployee(id, { active: false });
    await this.audit.log({
      actor: { type: 'employee', id: user.userId, name: user.name },
      action: 'attendance.employee.deactivate',
      entityType: 'attendance_employee',
      entityId: id,
      summary: `Employé pointage désactivé : ${doc.firstName} ${doc.lastName}`,
      ip: null,
    });
    return { ok: true };
  }
}
