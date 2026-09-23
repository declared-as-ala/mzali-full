import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { AuditActor } from '@contracts';
import { AuditService } from '@/audit/audit.service';
import { AttendanceEmployee } from './attendance-employee.schema';
import { AttendanceSession, AttendanceSessionDocument } from './attendance-session.schema';
import { attendanceBusinessDate, tunisStartOfMonth, tunisStartOfWeek, tunisToday } from './attendance-date';
import { toAttendanceEmployeeRecord, toAttendanceSessionRecord } from './attendance.mapper';
import { clampPagination, paginate } from '@/common/pagination';

export type DateRange = { from: string; to: string };

/**
 * Reporting/aggregation side of the isolated Pointage domain — dashboard
 * stats, the admin sessions table, employee summaries, rankings, and
 * corrections. Split from AttendanceService (which owns employee CRUD +
 * the kiosk's clock-in/out actions) the same way POS splits
 * PosSessionsService from PosAnalyticsService — different concerns, same
 * underlying collections.
 */
@Injectable()
export class AttendanceStatsService {
  constructor(
    @InjectModel(AttendanceEmployee.name) private readonly employees: Model<AttendanceEmployee>,
    @InjectModel(AttendanceSession.name) private readonly sessions: Model<AttendanceSession>,
    private readonly audit: AuditService,
  ) {}

  private presetRange(preset: 'today' | 'week' | 'month'): DateRange {
    const to = tunisToday();
    if (preset === 'today') return { from: to, to };
    if (preset === 'week') return { from: tunisStartOfWeek(), to };
    return { from: tunisStartOfMonth(), to };
  }

  /** Sum of durationMinutes for CLOSED sessions in [from,to] (inclusive,
   *  businessDate strings), plus the LIVE elapsed time of any OPEN
   *  session that also falls in range — so a mid-day dashboard reflects
   *  work actually happening right now, not just what's already closed. */
  private async minutesInRange(match: Record<string, unknown>, from: string, to: string): Promise<number> {
    const closed = await this.sessions.aggregate<{ _id: null; total: number }>([
      { $match: { ...match, status: 'CLOSED', businessDate: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: '$durationMinutes' } } },
    ]);
    const openOnes = await this.sessions.find({ ...match, status: 'OPEN', businessDate: { $gte: from, $lte: to } });
    const now = Date.now();
    const liveMinutes = openOnes.reduce((sum, s) => sum + Math.max(0, Math.round((now - s.clockIn.getTime()) / 60000)), 0);
    return (closed[0]?.total ?? 0) + liveMinutes;
  }

  async dashboard() {
    const today = tunisToday();
    const openSessions = await this.sessions.find({ status: 'OPEN' });
    const openOrReview = await this.sessions.countDocuments({ status: { $in: ['OPEN', 'NEEDS_REVIEW'] } });
    const distinctToday = await this.sessions.distinct('employeeId', { businessDate: today });
    const hoursTodayMinutes = await this.minutesInRange({}, today, today);

    const employeeIds = openSessions.map((s) => s.employeeId);
    const employeeDocs = employeeIds.length ? await this.employees.find({ _id: { $in: employeeIds } }) : [];
    const byId = new Map(employeeDocs.map((e) => [e.id, e]));
    const now = Date.now();

    return {
      presentNow: openSessions.length,
      hoursTodayMinutes,
      employeesClockedToday: distinctToday.length,
      openSessions: openOrReview,
      present: openSessions.map((s) => {
        const e = byId.get(s.employeeId);
        return {
          employeeId: s.employeeId,
          firstName: e?.firstName ?? '—',
          lastName: e?.lastName ?? '',
          clockIn: s.clockIn.toISOString(),
          currentMinutes: Math.max(0, Math.round((now - s.clockIn.getTime()) / 60000)),
        };
      }),
    };
  }

  async listSessions(filter: { employeeId?: string; status?: string; from?: string; to?: string; page?: number; perPage?: number }) {
    const { page, perPage, skip } = clampPagination(filter.page, filter.perPage, 100);
    const query: Record<string, unknown> = {};
    if (filter.employeeId) query.employeeId = filter.employeeId;
    if (filter.status) query.status = filter.status;
    if (filter.from || filter.to) {
      query.businessDate = { ...(filter.from ? { $gte: filter.from } : {}), ...(filter.to ? { $lte: filter.to } : {}) };
    }
    const [docs, total] = await Promise.all([
      this.sessions.find(query).sort({ clockIn: -1 }).skip(skip).limit(perPage),
      this.sessions.countDocuments(query),
    ]);
    const employeeIds = [...new Set(docs.map((d) => d.employeeId))];
    const employeeDocs = employeeIds.length ? await this.employees.find({ _id: { $in: employeeIds } }) : [];
    const names = new Map(employeeDocs.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));
    return paginate(
      docs.map((d) => ({ ...toAttendanceSessionRecord(d), employeeName: names.get(d.employeeId) ?? '—' })),
      total,
      page,
      perPage,
    );
  }

  async employeeSummary(employeeId: string, unpaid: { unpaidMinutes: number; unpaidAmountMinor: number }, totalPaidAmountMinor: number) {
    const employee = await this.employees.findById(employeeId).catch(() => null);
    if (!employee) throw new NotFoundException('Employé introuvable');
    const today = tunisToday();
    const [todayMinutes, weekMinutes, monthMinutes] = await Promise.all([
      this.minutesInRange({ employeeId }, today, today),
      this.minutesInRange({ employeeId }, tunisStartOfWeek(), today),
      this.minutesInRange({ employeeId }, tunisStartOfMonth(), today),
    ]);
    return {
      employee: toAttendanceEmployeeRecord(employee),
      todayMinutes,
      weekMinutes,
      monthMinutes,
      unpaidMinutes: unpaid.unpaidMinutes,
      unpaidAmountMinor: unpaid.unpaidAmountMinor,
      totalPaidAmountMinor,
    };
  }

  /** Ranked by actual approved WORKED duration — never by salary, per #23. */
  async topEmployees(range: DateRange, limit = 20) {
    const rows = await this.sessions.aggregate<{ _id: string; totalMinutes: number }>([
      { $match: { status: 'CLOSED', businessDate: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: '$employeeId', totalMinutes: { $sum: '$durationMinutes' } } },
      { $sort: { totalMinutes: -1 } },
      { $limit: limit },
    ]);
    const employeeDocs = rows.length ? await this.employees.find({ _id: { $in: rows.map((r) => r._id) } }) : [];
    const byId = new Map(employeeDocs.map((e) => [e.id, e]));
    return rows.map((r) => {
      const e = byId.get(r._id);
      return { employeeId: r._id, firstName: e?.firstName ?? '—', lastName: e?.lastName ?? '', totalMinutes: r.totalMinutes };
    });
  }

  async dailyBreakdown(employeeId: string, range: DateRange) {
    const rows = await this.sessions.aggregate<{ _id: string; minutes: number }>([
      { $match: { employeeId, status: 'CLOSED', businessDate: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: '$businessDate', minutes: { $sum: '$durationMinutes' } } },
      { $sort: { _id: 1 } },
    ]);
    return rows.map((r) => ({ date: r._id, minutes: r.minutes }));
  }

  resolvePreset(preset?: string, from?: string, to?: string): DateRange {
    if (from || to) {
      const today = tunisToday();
      return { from: from ?? today, to: to ?? today };
    }
    if (preset === 'week') return this.presetRange('week');
    if (preset === 'month') return this.presetRange('month');
    return this.presetRange('today');
  }

  /**
   * Admin correction for a missing/wrong clock-out (or clock-in) — never
   * silently edits history: the pre-correction values are preserved in
   * `correction.originalClockIn/originalClockOut`, a reason is required,
   * and the change is audited with before/after. Resolves a NEEDS_REVIEW
   * (forgotten clock-out) session the same way it resolves a normal one.
   */
  async correctSession(id: string, patch: { clockIn?: string; clockOut?: string }, reason: string, actor: AuditActor): Promise<AttendanceSessionDocument> {
    if (!reason.trim()) throw new BadRequestException('Un motif est requis pour toute correction.');
    const doc = await this.sessions.findById(id).catch(() => null);
    if (!doc) throw new NotFoundException('Session introuvable');

    const originalClockIn = doc.clockIn;
    const originalClockOut = doc.clockOut;
    const wasOpenOrReview = doc.status !== 'CLOSED';

    const nextClockIn = patch.clockIn ? new Date(patch.clockIn) : doc.clockIn;
    const nextClockOut = patch.clockOut ? new Date(patch.clockOut) : doc.clockOut;
    if (Number.isNaN(nextClockIn.getTime())) throw new BadRequestException('Heure d\'arrivée invalide.');
    if (patch.clockOut && Number.isNaN(nextClockOut?.getTime())) throw new BadRequestException('Heure de départ invalide.');
    if (nextClockOut && nextClockOut.getTime() <= nextClockIn.getTime()) {
      throw new BadRequestException('L\'heure de départ doit être après l\'heure d\'arrivée.');
    }
    // A session already paid is financial history — its timestamps
    // (and therefore its paid duration) must never move.
    if (doc.payrollPaymentId) throw new BadRequestException('Cette session a déjà été payée et ne peut plus être modifiée.');

    doc.clockIn = nextClockIn;
    doc.businessDate = attendanceBusinessDate(nextClockIn);
    if (nextClockOut) {
      doc.clockOut = nextClockOut;
      doc.durationMinutes = Math.max(0, Math.round((nextClockOut.getTime() - nextClockIn.getTime()) / 60000));
      doc.status = 'CLOSED';
    }
    doc.correction = {
      originalClockIn,
      originalClockOut,
      reason: reason.trim(),
      correctedBy: actor.id ?? 'system',
      correctedByName: actor.name,
      correctedAt: new Date(),
    } as AttendanceSessionDocument['correction'];
    await doc.save();

    await this.audit.log({
      actor,
      action: 'attendance.session.correct',
      entityType: 'attendance_session',
      entityId: doc.id,
      summary: `Correction de pointage (${wasOpenOrReview ? 'session non clôturée' : 'session existante'})`,
      before: { clockIn: originalClockIn?.toISOString() ?? null, clockOut: originalClockOut?.toISOString() ?? null },
      after: { clockIn: doc.clockIn.toISOString(), clockOut: doc.clockOut?.toISOString() ?? null, reason: reason.trim() },
      ip: null,
    });

    return doc;
  }
}
