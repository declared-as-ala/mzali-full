/**
 * Africa/Tunis business-day boundary for attendance sessions — mirrors
 * `pos/cash-accounting.ts`'s `cashBusinessDate` exactly (same pattern,
 * intentionally duplicated rather than shared: this codebase defines a
 * small domain-scoped date helper per feature rather than one generic
 * cross-domain util, see POS/stats for the established precedent). A
 * session keeps the business date of its clock-in, including work that
 * crosses midnight.
 */
export function attendanceBusinessDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
