import type { AttendanceEmployeeRecord, AttendanceSessionRecord } from '@contracts';
import { AttendanceEmployeeDocument } from './attendance-employee.schema';
import { AttendanceSessionDocument } from './attendance-session.schema';

/** pinHash is deliberately never read here — see the schema's doc on why
 *  it must never reach the frontend, not even indirectly via a stray field. */
export function toAttendanceEmployeeRecord(doc: AttendanceEmployeeDocument): AttendanceEmployeeRecord {
  return {
    id: doc.id,
    firstName: doc.firstName,
    lastName: doc.lastName,
    phone: doc.phone,
    email: doc.email,
    jobTitle: doc.jobTitle,
    photoUrl: doc.photoUrl,
    hourlyRateMinor: doc.hourlyRateMinor,
    active: doc.active,
    hiredAt: doc.hiredAt ? doc.hiredAt.toISOString() : null,
    notes: doc.notes,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function toAttendanceSessionRecord(doc: AttendanceSessionDocument): AttendanceSessionRecord {
  return {
    id: doc.id,
    employeeId: doc.employeeId,
    clockIn: doc.clockIn.toISOString(),
    clockOut: doc.clockOut ? doc.clockOut.toISOString() : null,
    durationMinutes: doc.durationMinutes,
    status: doc.status,
    businessDate: doc.businessDate,
    source: doc.source,
    payrollPaymentId: doc.payrollPaymentId,
    correction: doc.correction
      ? {
          originalClockIn: doc.correction.originalClockIn ? doc.correction.originalClockIn.toISOString() : null,
          originalClockOut: doc.correction.originalClockOut ? doc.correction.originalClockOut.toISOString() : null,
          reason: doc.correction.reason,
          correctedBy: doc.correction.correctedBy,
          correctedByName: doc.correction.correctedByName,
          correctedAt: doc.correction.correctedAt.toISOString(),
        }
      : null,
  };
}
