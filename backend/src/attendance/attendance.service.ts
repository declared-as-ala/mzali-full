import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { AttendanceEmployee, AttendanceEmployeeDocument } from './attendance-employee.schema';
import { AttendanceSession, AttendanceSessionDocument } from './attendance-session.schema';
import { attendanceBusinessDate } from './attendance-date';
import { hashPin, isValidPinFormat, verifyPin } from './attendance-pin';

export type IdentifyOutcome =
  | { ok: false }
  | { ok: true; status: 'ready_to_start'; employee: AttendanceEmployeeDocument }
  | { ok: true; status: 'ready_to_end'; employee: AttendanceEmployeeDocument; session: AttendanceSessionDocument }
  | { ok: true; status: 'blocked_stale_session'; employee: AttendanceEmployeeDocument };

/** How recently a session must have closed for a repeat clock-out call to
 *  be treated as an idempotent retry (double-click / duplicate request)
 *  rather than a genuine "no open session" error — see #5. */
const CLOCK_OUT_RETRY_WINDOW_MS = 15_000;

@Injectable()
export class AttendanceService {
  constructor(
    @InjectModel(AttendanceEmployee.name) private readonly employees: Model<AttendanceEmployee>,
    @InjectModel(AttendanceSession.name) private readonly sessions: Model<AttendanceSession>,
  ) {}

  // ── Employee management (admin) ─────────────────────────────────────

  async listEmployees(): Promise<AttendanceEmployeeDocument[]> {
    return this.employees.find().sort({ firstName: 1, lastName: 1 });
  }

  async getEmployee(id: string): Promise<AttendanceEmployeeDocument> {
    const doc = await this.employees.findById(id).catch(() => null);
    if (!doc) throw new NotFoundException('Employé introuvable');
    return doc;
  }

  /** Plaintext-compares the new PIN against every OTHER active employee's
   *  hash before allowing a create/reset — the uniqueness guarantee lives
   *  here (write time), since a hashed PIN can't be looked up by value. */
  private async assertPinAvailable(pin: string, excludeEmployeeId?: string): Promise<void> {
    if (!isValidPinFormat(pin)) throw new BadRequestException('Le code PIN doit contenir 4 à 6 chiffres.');
    const others = await this.employees.find({ active: true, ...(excludeEmployeeId ? { _id: { $ne: excludeEmployeeId } } : {}) });
    for (const other of others) {
      if (await verifyPin(other.pinHash, pin)) {
        throw new ConflictException('Ce code PIN est déjà utilisé par un autre employé actif.');
      }
    }
  }

  async createEmployee(input: {
    firstName: string; lastName?: string; phone?: string; email?: string | null; jobTitle?: string;
    photoUrl?: string | null; pin: string; hourlyRateMinor?: number; active?: boolean; hiredAt?: string | null; notes?: string;
  }): Promise<AttendanceEmployeeDocument> {
    const hourlyRateMinor = input.hourlyRateMinor ?? 0;
    if (!Number.isInteger(hourlyRateMinor) || hourlyRateMinor < 0) {
      throw new BadRequestException('Tarif horaire invalide.');
    }
    await this.assertPinAvailable(input.pin);
    return this.employees.create({
      firstName: input.firstName.trim(),
      lastName: input.lastName?.trim() ?? '',
      phone: input.phone?.trim() ?? '',
      email: input.email?.trim().toLowerCase() || null,
      jobTitle: input.jobTitle?.trim() ?? '',
      photoUrl: input.photoUrl ?? null,
      pinHash: await hashPin(input.pin),
      hourlyRateMinor,
      active: input.active ?? true,
      hiredAt: input.hiredAt ? new Date(input.hiredAt) : null,
      notes: input.notes?.trim() ?? '',
    });
  }

  async updateEmployee(id: string, patch: {
    firstName?: string; lastName?: string; phone?: string; email?: string | null; jobTitle?: string;
    photoUrl?: string | null; hourlyRateMinor?: number; active?: boolean; hiredAt?: string | null; notes?: string;
  }): Promise<AttendanceEmployeeDocument> {
    const doc = await this.getEmployee(id);
    if (patch.firstName !== undefined) doc.firstName = patch.firstName.trim();
    if (patch.lastName !== undefined) doc.lastName = patch.lastName.trim();
    if (patch.phone !== undefined) doc.phone = patch.phone.trim();
    if (patch.email !== undefined) doc.email = patch.email?.trim().toLowerCase() || null;
    if (patch.jobTitle !== undefined) doc.jobTitle = patch.jobTitle.trim();
    if (patch.photoUrl !== undefined) doc.photoUrl = patch.photoUrl;
    if (patch.hourlyRateMinor !== undefined) {
      if (!Number.isInteger(patch.hourlyRateMinor) || patch.hourlyRateMinor < 0) throw new BadRequestException('Tarif horaire invalide.');
      doc.hourlyRateMinor = patch.hourlyRateMinor;
    }
    if (patch.active !== undefined) doc.active = patch.active;
    if (patch.hiredAt !== undefined) doc.hiredAt = patch.hiredAt ? new Date(patch.hiredAt) : null;
    if (patch.notes !== undefined) doc.notes = patch.notes.trim();
    await doc.save();
    return doc;
  }

  /** Admin resets a PIN — the old one is never retrievable, only replaceable. */
  async resetPin(id: string, newPin: string): Promise<void> {
    const doc = await this.getEmployee(id);
    await this.assertPinAvailable(newPin, id);
    doc.pinHash = await hashPin(newPin);
    await doc.save();
  }

  // ── Kiosk (public, PIN-only) ─────────────────────────────────────────

  /**
   * Scans every ACTIVE employee's pinHash — O(n) argon2 verifies, fine
   * for a small boutique team (this is a deliberate scale assumption, not
   * an oversight: PINs are hashed/salted, so there is no way to look one
   * up by value without either this scan or a searchable-but-weaker
   * secondary index, which would leak information the hash is meant to
   * hide). Inactive employees never match, even with the correct PIN —
   * see #28.
   */
  private async findEmployeeByPin(pin: string): Promise<AttendanceEmployeeDocument | null> {
    if (!isValidPinFormat(pin)) return null;
    const active = await this.employees.find({ active: true });
    for (const employee of active) {
      if (await verifyPin(employee.pinHash, pin)) return employee;
    }
    return null;
  }

  /**
   * The kiosk's single entry point: identifies the employee from their
   * PIN and reports exactly what the screen should show next. Never
   * distinguishes "wrong PIN" from "inactive employee" to the caller —
   * both come back as `{ ok: false }` so the kiosk can never be used to
   * probe which PINs exist or which employees are active (see #8).
   */
  async identify(pin: string): Promise<IdentifyOutcome> {
    const employee = await this.findEmployeeByPin(pin);
    if (!employee) return { ok: false };

    const open = await this.sessions.findOne({ employeeId: employee.id, status: { $in: ['OPEN', 'NEEDS_REVIEW'] } });
    if (!open) return { ok: true, status: 'ready_to_start', employee };

    const today = attendanceBusinessDate(new Date());
    if (open.status === 'NEEDS_REVIEW' || open.businessDate !== today) {
      // Forgotten clock-out from a previous day — flag it (idempotent: a
      // second identify() call while still unresolved just re-flags the
      // same session) and refuse both clock-in and clock-out from the
      // kiosk. Only an admin correction can resolve it — see #20.
      if (open.status !== 'NEEDS_REVIEW') {
        open.status = 'NEEDS_REVIEW';
        await open.save();
      }
      return { ok: true, status: 'blocked_stale_session', employee };
    }

    return { ok: true, status: 'ready_to_end', employee, session: open };
  }

  async clockIn(employeeId: string, source?: string): Promise<AttendanceSessionDocument> {
    const now = new Date();
    try {
      return await this.transaction(async (txn) => {
        const existing = await this.sessions.findOne({ employeeId, status: { $in: ['OPEN', 'NEEDS_REVIEW'] } }).session(txn);
        if (existing) {
          if (existing.status === 'NEEDS_REVIEW') throw new ConflictException('Une session précédente non clôturée doit être corrigée par un administrateur.');
          throw new ConflictException('Une session est déjà ouverte pour cet employé.');
        }
        const [doc] = await this.sessions.create(
          [{ employeeId, clockIn: now, status: 'OPEN', businessDate: attendanceBusinessDate(now), source: source ?? null }],
          { session: txn },
        );
        return doc;
      });
    } catch (error) {
      // The partial unique index is the final guard under a genuine race
      // (two near-simultaneous clock-ins) — treat it as an idempotent
      // retry and hand back the session that won, rather than erroring a
      // confused employee who only tapped once.
      if ((error as { code?: number }).code === 11000) {
        const existing = await this.sessions.findOne({ employeeId, status: 'OPEN' });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async clockOut(employeeId: string): Promise<AttendanceSessionDocument> {
    return this.transaction(async (txn) => {
      const open = await this.sessions.findOne({ employeeId, status: 'OPEN' }).session(txn);
      if (open) {
        const now = new Date();
        open.clockOut = now;
        open.durationMinutes = Math.max(0, Math.round((now.getTime() - open.clockIn.getTime()) / 60000));
        open.status = 'CLOSED';
        await open.save({ session: txn });
        return open;
      }
      // No open session — either a genuine error, or a double-click retry
      // arriving after the first request already closed it. Idempotent:
      // hand back the just-closed session instead of erroring.
      const mostRecent = await this.sessions.findOne({ employeeId, status: 'CLOSED' }).sort({ clockOut: -1 }).session(txn);
      if (mostRecent?.clockOut && Date.now() - mostRecent.clockOut.getTime() < CLOCK_OUT_RETRY_WINDOW_MS) {
        return mostRecent;
      }
      throw new BadRequestException('Aucune session ouverte pour cet employé.');
    });
  }

  /**
   * Currently clocked-in employees, for the kiosk's shared "who's here"
   * list (public — no PIN needed to view, only to add a new clock-in;
   * see AttendancePublicController's doc for the tradeoff this accepts).
   */
  async listActive(): Promise<{ employeeId: string; firstName: string; lastName: string; clockIn: string }[]> {
    const open = await this.sessions.find({ status: 'OPEN' }).sort({ clockIn: 1 });
    if (!open.length) return [];
    const employees = await this.employees.find({ _id: { $in: open.map((s) => s.employeeId) } });
    const byId = new Map(employees.map((e) => [e.id, e]));
    return open.map((s) => {
      const e = byId.get(s.employeeId);
      return { employeeId: s.employeeId, firstName: e?.firstName ?? '—', lastName: e?.lastName ?? '', clockIn: s.clockIn.toISOString() };
    });
  }

  async transaction<T>(fn: (txn: ClientSession) => Promise<T>): Promise<T> {
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
