// Backend-only contract (not mirrored from frontend types/) — isolated
// Pointage/payroll domain, see backend/src/attendance/.

export type AttendanceEmployeeRecord = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  jobTitle: string;
  photoUrl: string | null;
  // pinHash is NEVER included here — see attendance-employee.schema.ts's doc.
  hourlyRateMinor: number;
  active: boolean;
  hiredAt: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type AttendanceSessionRecord = {
  id: string;
  employeeId: string;
  clockIn: string;
  clockOut: string | null;
  durationMinutes: number | null;
  status: 'OPEN' | 'CLOSED' | 'NEEDS_REVIEW';
  businessDate: string;
  source: string | null;
  payrollPaymentId: string | null;
  correction: {
    originalClockIn: string | null;
    originalClockOut: string | null;
    reason: string;
    correctedBy: string;
    correctedByName: string | null;
    correctedAt: string;
  } | null;
};

/** What the kiosk shows next — mirrors AttendanceService.IdentifyOutcome
 *  minus the raw Mongoose documents, with employee/session already
 *  reduced to their safe record shapes. */
export type PointageIdentifyResponse =
  | { ok: false }
  | { ok: true; status: 'ready_to_start'; employee: { id: string; firstName: string; lastName: string } }
  | { ok: true; status: 'ready_to_end'; employee: { id: string; firstName: string; lastName: string }; session: { id: string; clockIn: string } }
  | { ok: true; status: 'blocked_stale_session'; employee: { id: string; firstName: string; lastName: string } };
