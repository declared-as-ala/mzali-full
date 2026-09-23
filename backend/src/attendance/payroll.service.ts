import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import type { AuditActor, PayrollPaymentRecord, PayrollUnpaidSummary } from '@contracts';
import { AuditService } from '@/audit/audit.service';
import { CountersService } from '@/database/counters.service';
import { AttendanceEmployee, AttendanceEmployeeDocument } from './attendance-employee.schema';
import { AttendanceSession, AttendanceSessionDocument } from './attendance-session.schema';
import { PayrollPayment, PayrollPaymentDocument, PaymentMethod } from './payroll-payment.schema';

const PAYROLL_NUMBER_SEQUENCE = 'payrollNumber';

export function toPayrollPaymentRecord(doc: PayrollPaymentDocument, employeeName: string): PayrollPaymentRecord {
  return {
    id: doc.id,
    payrollNumber: doc.payrollNumber,
    employeeId: doc.employeeId,
    employeeName,
    sessionIds: doc.sessionIds,
    periodStart: doc.periodStart.toISOString(),
    periodEnd: doc.periodEnd.toISOString(),
    totalMinutes: doc.totalMinutes,
    hourlyRateMinorSnapshot: doc.hourlyRateMinorSnapshot,
    baseAmountMinor: doc.baseAmountMinor,
    bonusMinor: doc.bonusMinor,
    deductionMinor: doc.deductionMinor,
    finalAmountMinor: doc.finalAmountMinor,
    paymentMethod: doc.paymentMethod,
    paidAt: doc.paidAt.toISOString(),
    paidById: doc.paidById,
    paidByName: doc.paidByName,
    note: doc.note,
  };
}

/**
 * Payroll: turns unpaid CLOSED `AttendanceSession`s into an immutable
 * `PayrollPayment`. Paying never deletes or edits the underlying sessions
 * — it only stamps `payrollPaymentId` on each one it covers, so "unpaid
 * hours" is always just "CLOSED sessions with no payment id" (see #16),
 * and the rate used is snapshotted onto the payment forever (see #17) —
 * a later raise never rewrites already-paid history.
 */
@Injectable()
export class PayrollService {
  constructor(
    @InjectModel(AttendanceEmployee.name) private readonly employees: Model<AttendanceEmployee>,
    @InjectModel(AttendanceSession.name) private readonly sessions: Model<AttendanceSession>,
    @InjectModel(PayrollPayment.name) private readonly payments: Model<PayrollPayment>,
    private readonly counters: CountersService,
    private readonly audit: AuditService,
  ) {}

  private async unpaidSessionsFor(employeeId: string): Promise<AttendanceSessionDocument[]> {
    return this.sessions.find({ employeeId, status: 'CLOSED', payrollPaymentId: null }).sort({ clockIn: 1 });
  }

  /** One row per employee who has ANY unpaid closed hours, active or not
   *  — an employee who left still has a right to be paid for time worked. */
  async unpaidSummary(): Promise<PayrollUnpaidSummary[]> {
    const rows = await this.sessions.aggregate<{
      _id: string;
      unpaidMinutes: number;
      periodStart: Date;
      periodEnd: Date;
    }>([
      { $match: { status: 'CLOSED', payrollPaymentId: null } },
      { $group: { _id: '$employeeId', unpaidMinutes: { $sum: '$durationMinutes' }, periodStart: { $min: '$clockIn' }, periodEnd: { $max: '$clockOut' } } },
    ]);
    if (!rows.length) return [];

    const employeeIds = rows.map((r) => r._id);
    const [employeeDocs, lastPayments] = await Promise.all([
      this.employees.find({ _id: { $in: employeeIds } }),
      this.payments.aggregate<{ _id: string; lastPaymentAt: Date }>([
        { $match: { employeeId: { $in: employeeIds } } },
        { $group: { _id: '$employeeId', lastPaymentAt: { $max: '$paidAt' } } },
      ]),
    ]);
    const employeeById = new Map(employeeDocs.map((e) => [e.id, e]));
    const lastPaymentByEmployee = new Map(lastPayments.map((p) => [p._id, p.lastPaymentAt]));

    return rows.map((r) => {
      const employee = employeeById.get(r._id);
      const rate = employee?.hourlyRateMinor ?? 0;
      return {
        employeeId: r._id,
        firstName: employee?.firstName ?? '—',
        lastName: employee?.lastName ?? '',
        active: employee?.active ?? false,
        hourlyRateMinor: rate,
        unpaidMinutes: r.unpaidMinutes,
        unpaidAmountMinor: Math.round((r.unpaidMinutes * rate) / 60),
        periodStart: r.periodStart ? r.periodStart.toISOString() : null,
        periodEnd: r.periodEnd ? r.periodEnd.toISOString() : null,
        lastPaymentAt: lastPaymentByEmployee.get(r._id)?.toISOString() ?? null,
      };
    });
  }

  /**
   * Pays every currently-unpaid CLOSED session for one employee, at a
   * rate the admin types in at payment time (the "calculator" — this
   * domain never fixes an hourly rate on the employee; see
   * `AttendanceEmployee.hourlyRateMinor`'s doc). Optional bonus/
   * deduction adjust the final amount without touching the base
   * calculation, so the base/bonus/deduction breakdown always stays
   * auditable on the payment itself. The rate used is remembered back
   * onto the employee purely so the next payment's calculator prefills
   * with it — it is never re-read for an already-created payment.
   */
  async createPayment(
    employeeId: string,
    input: { hourlyRateMinor: number; bonusMinor?: number; deductionMinor?: number; paymentMethod: PaymentMethod; note?: string },
    actor: AuditActor,
  ): Promise<PayrollPaymentDocument> {
    const employee = await this.employees.findById(employeeId).catch(() => null);
    if (!employee) throw new NotFoundException('Employé introuvable');

    const hourlyRateMinorSnapshot = input.hourlyRateMinor;
    const bonusMinor = input.bonusMinor ?? 0;
    const deductionMinor = input.deductionMinor ?? 0;
    if (!Number.isInteger(hourlyRateMinorSnapshot) || hourlyRateMinorSnapshot < 0) throw new BadRequestException('Prix de l\'heure invalide.');
    if (!Number.isInteger(bonusMinor) || bonusMinor < 0) throw new BadRequestException('Prime invalide.');
    if (!Number.isInteger(deductionMinor) || deductionMinor < 0) throw new BadRequestException('Retenue invalide.');

    const unpaid = await this.unpaidSessionsFor(employeeId);
    if (!unpaid.length) throw new BadRequestException('Aucune heure impayée pour cet employé.');

    const totalMinutes = unpaid.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);
    const baseAmountMinor = Math.round((totalMinutes * hourlyRateMinorSnapshot) / 60);
    const finalAmountMinor = baseAmountMinor + bonusMinor - deductionMinor;
    if (finalAmountMinor < 0) throw new BadRequestException('Le montant final ne peut pas être négatif.');

    const periodStart = unpaid[0].clockIn;
    const periodEnd = unpaid.reduce((latest, s) => (s.clockOut && s.clockOut > latest ? s.clockOut : latest), unpaid[0].clockOut ?? unpaid[0].clockIn);
    const sessionIds = unpaid.map((s) => s.id);

    const payment = await this.transaction(async (txn) => {
      const payrollNumber = `PAY-${String(await this.counters.next(PAYROLL_NUMBER_SEQUENCE, txn)).padStart(5, '0')}`;
      const [doc] = await this.payments.create(
        [{
          payrollNumber,
          employeeId,
          sessionIds,
          periodStart,
          periodEnd,
          totalMinutes,
          hourlyRateMinorSnapshot,
          baseAmountMinor,
          bonusMinor,
          deductionMinor,
          finalAmountMinor,
          paymentMethod: input.paymentMethod,
          paidById: actor.id ?? 'system',
          paidByName: actor.name,
          note: input.note?.trim() ?? '',
        }],
        { session: txn },
      );
      await this.sessions.updateMany({ _id: { $in: sessionIds } }, { $set: { payrollPaymentId: doc.id } }, { session: txn });
      employee.hourlyRateMinor = hourlyRateMinorSnapshot;
      await employee.save({ session: txn });
      return doc;
    });

    await this.audit.log({
      actor,
      action: 'payroll.pay',
      entityType: 'payroll_payment',
      entityId: payment.id,
      summary: `Paiement ${payment.payrollNumber} — ${employee.firstName} ${employee.lastName} (${(finalAmountMinor / 1000).toFixed(3)} TND)`,
      after: { totalMinutes, baseAmountMinor, bonusMinor, deductionMinor, finalAmountMinor, paymentMethod: input.paymentMethod, sessionCount: sessionIds.length },
      ip: null,
    });

    return payment;
  }

  async listPayments(filter: { employeeId?: string; page?: number; perPage?: number }) {
    const query: Record<string, unknown> = {};
    if (filter.employeeId) query.employeeId = filter.employeeId;
    const page = Math.max(1, filter.page ?? 1);
    const perPage = Math.min(100, Math.max(1, filter.perPage ?? 20));
    const [docs, total] = await Promise.all([
      this.payments.find(query).sort({ paidAt: -1 }).skip((page - 1) * perPage).limit(perPage),
      this.payments.countDocuments(query),
    ]);
    const employeeIds = [...new Set(docs.map((d) => d.employeeId))];
    const employeeDocs = employeeIds.length ? await this.employees.find({ _id: { $in: employeeIds } }) : [];
    const names = new Map(employeeDocs.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));
    return {
      items: docs.map((d) => toPayrollPaymentRecord(d, names.get(d.employeeId) ?? '—')),
      total,
      page,
      perPage,
    };
  }

  async getPayment(id: string): Promise<{ payment: PayrollPaymentDocument; employee: AttendanceEmployeeDocument }> {
    const payment = await this.payments.findById(id).catch(() => null);
    if (!payment) throw new NotFoundException('Paiement introuvable');
    const employee = await this.employees.findById(payment.employeeId).catch(() => null);
    if (!employee) throw new NotFoundException('Employé introuvable');
    return { payment, employee };
  }

  async totalPaidForEmployee(employeeId: string): Promise<number> {
    const rows = await this.payments.aggregate<{ _id: null; total: number }>([
      { $match: { employeeId } },
      { $group: { _id: null, total: { $sum: '$finalAmountMinor' } } },
    ]);
    return rows[0]?.total ?? 0;
  }

  /** All-time paid/unpaid totals for the Paie dashboard's headline cards. */
  async summary(): Promise<{ totalPaidMinor: number; totalUnpaidMinor: number; paymentCount: number }> {
    const [paidRows, unpaid] = await Promise.all([
      this.payments.aggregate<{ _id: null; total: number; count: number }>([
        { $group: { _id: null, total: { $sum: '$finalAmountMinor' }, count: { $sum: 1 } } },
      ]),
      this.unpaidSummary(),
    ]);
    return {
      totalPaidMinor: paidRows[0]?.total ?? 0,
      paymentCount: paidRows[0]?.count ?? 0,
      totalUnpaidMinor: unpaid.reduce((sum, u) => sum + u.unpaidAmountMinor, 0),
    };
  }

  private async transaction<T>(fn: (txn: ClientSession) => Promise<T>): Promise<T> {
    const txn = await this.sessions.db.startSession();
    try {
      let result!: T;
      await txn.withTransaction(async () => { result = await fn(txn); });
      return result;
    } finally {
      await txn.endSession();
    }
  }
}
