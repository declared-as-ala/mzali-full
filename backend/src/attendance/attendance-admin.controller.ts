import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/current-user.decorator';
import { JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { AttendanceStatsService } from './attendance-stats.service';
import { PayrollService } from './payroll.service';
import { toAttendanceSessionRecord } from './attendance.mapper';
import { CorrectSessionDto } from './dto/attendance-employee.dto';

/** Reporting/dashboard/correction side of the admin Pointage UI — the
 *  CRUD side lives in AttendanceEmployeesAdminController. */
@ApiTags('admin/attendance')
@ApiBearerAuth()
@Controller('admin/attendance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttendanceAdminController {
  constructor(
    private readonly stats: AttendanceStatsService,
    private readonly payroll: PayrollService,
  ) {}

  @Get('dashboard')
  @RequirePermissions('attendance.view')
  async dashboard() {
    return this.stats.dashboard();
  }

  @Get('sessions')
  @RequirePermissions('attendance.view')
  async listSessions(
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.stats.listSessions({
      employeeId,
      status,
      from,
      to,
      page: page ? Number(page) : undefined,
      perPage: perPage ? Number(perPage) : undefined,
    });
  }

  @Get('employees/:id/summary')
  @RequirePermissions('attendance.view')
  async employeeSummary(@Param('id') id: string) {
    const [unpaidSummary, totalPaid] = await Promise.all([
      this.payroll.unpaidSummary(),
      this.payroll.totalPaidForEmployee(id),
    ]);
    const unpaid = unpaidSummary.find((u) => u.employeeId === id);
    return this.stats.employeeSummary(
      id,
      { unpaidMinutes: unpaid?.unpaidMinutes ?? 0, unpaidAmountMinor: unpaid?.unpaidAmountMinor ?? 0 },
      totalPaid,
    );
  }

  @Get('employees/:id/daily')
  @RequirePermissions('attendance.view')
  async employeeDaily(@Param('id') id: string, @Query('preset') preset?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const range = this.stats.resolvePreset(preset, from, to);
    return this.stats.dailyBreakdown(id, range);
  }

  @Get('top-employees')
  @RequirePermissions('attendance.view')
  async topEmployees(@Query('preset') preset?: string, @Query('from') from?: string, @Query('to') to?: string, @Query('limit') limit?: string) {
    const range = this.stats.resolvePreset(preset, from, to);
    return this.stats.topEmployees(range, limit ? Number(limit) : undefined);
  }

  @Post('sessions/:id/correct')
  @RequirePermissions('attendance.correct')
  async correctSession(@Param('id') id: string, @Body() dto: CorrectSessionDto, @CurrentUser() user: RequestUser) {
    const doc = await this.stats.correctSession(
      id,
      { clockIn: dto.clockIn, clockOut: dto.clockOut },
      dto.reason,
      { type: 'employee', id: user.userId, name: user.name },
    );
    return toAttendanceSessionRecord(doc);
  }
}
