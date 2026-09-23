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

/**
 * A calendar-only Date (midnight UTC) whose Y/M/D match "today" in
 * Africa/Tunis. Deliberately treated as if it were UTC for all the day/
 * week/month arithmetic below — weekday and date-add math only depend on
 * the calendar date, never on the real instant/timezone, so this is safe
 * and avoids re-deriving the offset by hand (Tunisia has no DST, but this
 * approach doesn't even need to know that).
 */
function tunisCalendarToday(): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday of the current Africa/Tunis week, as a YYYY-MM-DD string. */
export function tunisStartOfWeek(): string {
  const today = tunisCalendarToday();
  const dow = today.getUTCDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() + diff);
  return toDateStr(monday);
}

/** 1st of the current Africa/Tunis month, as a YYYY-MM-DD string. */
export function tunisStartOfMonth(): string {
  const today = tunisCalendarToday();
  return toDateStr(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
}

/** Today in Africa/Tunis, as a YYYY-MM-DD string — same value
 *  `attendanceBusinessDate(new Date())` would give, exposed directly so
 *  callers building a date range don't need a throwaway Date object. */
export function tunisToday(): string {
  return toDateStr(tunisCalendarToday());
}
