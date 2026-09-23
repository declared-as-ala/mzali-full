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

export type AttendancePresentEntry = {
  employeeId: string;
  firstName: string;
  lastName: string;
  clockIn: string;
  currentMinutes: number;
};

export type AttendanceDashboardStats = {
  presentNow: number;
  hoursTodayMinutes: number;
  employeesClockedToday: number;
  openSessions: number;
  present: AttendancePresentEntry[];
};

export type AttendanceEmployeeSummary = {
  employee: AttendanceEmployeeRecord;
  todayMinutes: number;
  weekMinutes: number;
  monthMinutes: number;
  unpaidMinutes: number;
  unpaidAmountMinor: number;
  totalPaidAmountMinor: number;
};

export type PayrollUnpaidSummary = {
  employeeId: string;
  firstName: string;
  lastName: string;
  active: boolean;
  hourlyRateMinor: number;
  unpaidMinutes: number;
  unpaidAmountMinor: number;
  periodStart: string | null;
  periodEnd: string | null;
  lastPaymentAt: string | null;
};

export type PayrollPaymentRecord = {
  id: string;
  payrollNumber: string;
  employeeId: string;
  employeeName: string;
  sessionIds: string[];
  periodStart: string;
  periodEnd: string;
  totalMinutes: number;
  hourlyRateMinorSnapshot: number;
  baseAmountMinor: number;
  bonusMinor: number;
  deductionMinor: number;
  finalAmountMinor: number;
  paymentMethod: 'cash' | 'transfer' | 'other';
  paidAt: string;
  paidById: string;
  paidByName: string;
  note: string;
};

export type AttendanceTopEmployeeEntry = {
  employeeId: string;
  firstName: string;
  lastName: string;
  totalMinutes: number;
};

export type AttendanceDailyHoursEntry = {
  date: string; // YYYY-MM-DD, Africa/Tunis
  minutes: number;
};
