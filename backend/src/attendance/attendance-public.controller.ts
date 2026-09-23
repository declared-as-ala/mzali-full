import { BadRequestException, Body, Controller, Ip, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuditService } from '@/audit/audit.service';
import { RateLimitGuard } from '@/common/rate-limit.guard';
import { ServiceTokenGuard } from '@/auth/guards/service-token.guard';
import { AttendanceService } from './attendance.service';
import { toAttendanceSessionRecord } from './attendance.mapper';
import { ClockActionDto, IdentifyDto } from './dto/attendance-employee.dto';

/**
 * The `/pointage` kiosk's entire backend surface — no JWT, ever (see the
 * feature's explicit requirement: an employee only needs their PIN, never
 * a full Admin login). Guarded by ServiceTokenGuard (only the Next BFF
 * calls this, matching CatalogPublicController's established pattern —
 * browsers never hit it directly) plus a per-IP RateLimitGuard on every
 * PIN-bearing endpoint as the primary brute-force defense (see #8): PINs
 * are identified by scanning active employees rather than a direct
 * lookup, so there is no single "employeeId" to rate-limit against until
 * a PIN is already known to be correct.
 */
@ApiTags('pointage')
@Controller('pointage')
@UseGuards(ServiceTokenGuard)
export class AttendancePublicController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly audit: AuditService,
  ) {}

  @Post('identify')
  @UseGuards(RateLimitGuard(20, 60))
  async identify(@Body() dto: IdentifyDto, @Ip() ip: string) {
    const result = await this.attendance.identify(dto.pin);
    if (!result.ok) {
      await this.logFailedAttempt(ip);
      return { ok: false };
    }
    if (result.status === 'ready_to_start') {
      return { ok: true, status: 'ready_to_start', employee: { id: result.employee.id, firstName: result.employee.firstName, lastName: result.employee.lastName } };
    }
    if (result.status === 'ready_to_end') {
      return {
        ok: true,
        status: 'ready_to_end',
        employee: { id: result.employee.id, firstName: result.employee.firstName, lastName: result.employee.lastName },
        session: { id: result.session.id, clockIn: result.session.clockIn.toISOString() },
      };
    }
    return { ok: true, status: 'blocked_stale_session', employee: { id: result.employee.id, firstName: result.employee.firstName, lastName: result.employee.lastName } };
  }

  @Post('clock-in')
  @UseGuards(RateLimitGuard(10, 60))
  async clockIn(@Body() dto: ClockActionDto, @Ip() ip: string) {
    const identified = await this.attendance.identify(dto.pin);
    if (!identified.ok) {
      await this.logFailedAttempt(ip);
      return { ok: false, error: 'Code PIN incorrect.' };
    }
    if (identified.status === 'blocked_stale_session') {
      return { ok: false, error: 'Une session précédente n\'a pas été clôturée. Veuillez contacter l\'administrateur.' };
    }
    if (identified.status === 'ready_to_end') {
      throw new BadRequestException('Une session est déjà en cours.');
    }
    const session = await this.attendance.clockIn(identified.employee.id, dto.source);
    await this.audit.log({
      actor: { type: 'employee', id: identified.employee.id, name: `${identified.employee.firstName} ${identified.employee.lastName}` },
      action: 'attendance.clock_in',
      entityType: 'attendance_session',
      entityId: session.id,
      summary: `${identified.employee.firstName} ${identified.employee.lastName} — début de journée`,
      ip,
    });
    return {
      ok: true,
      employee: { firstName: identified.employee.firstName, lastName: identified.employee.lastName },
      session: toAttendanceSessionRecord(session),
    };
  }

  @Post('clock-out')
  @UseGuards(RateLimitGuard(10, 60))
  async clockOut(@Body() dto: ClockActionDto, @Ip() ip: string) {
    const identified = await this.attendance.identify(dto.pin);
    if (!identified.ok) {
      await this.logFailedAttempt(ip);
      return { ok: false, error: 'Code PIN incorrect.' };
    }
    if (identified.status === 'blocked_stale_session') {
      return { ok: false, error: 'Une session précédente n\'a pas été clôturée. Veuillez contacter l\'administrateur.' };
    }
    if (identified.status === 'ready_to_start') {
      throw new BadRequestException('Aucune session ouverte pour cet employé.');
    }
    const session = await this.attendance.clockOut(identified.employee.id);
    await this.audit.log({
      actor: { type: 'employee', id: identified.employee.id, name: `${identified.employee.firstName} ${identified.employee.lastName}` },
      action: 'attendance.clock_out',
      entityType: 'attendance_session',
      entityId: session.id,
      summary: `${identified.employee.firstName} ${identified.employee.lastName} — fin de journée (${session.durationMinutes ?? 0} min)`,
      ip,
    });
    return {
      ok: true,
      employee: { firstName: identified.employee.firstName, lastName: identified.employee.lastName },
      session: toAttendanceSessionRecord(session),
    };
  }

  /** Never logs the PIN itself — only that an attempt failed. See #30. */
  private async logFailedAttempt(ip: string): Promise<void> {
    await this.audit.log({
      actor: { type: 'system', id: null, name: 'pointage-kiosk' },
      action: 'attendance.pin_failed',
      entityType: 'attendance_employee',
      summary: 'Tentative de pointage avec un code PIN invalide',
      ip,
    });
  }
}
