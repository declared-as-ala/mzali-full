import { attendanceBusinessDate } from './attendance-date';

describe('attendanceBusinessDate', () => {
  it('returns the Africa/Tunis calendar date (YYYY-MM-DD) for a UTC instant', () => {
    // 2026-01-15T23:30:00Z is 2026-01-16 00:30 in Tunis (UTC+1) — the
    // business date must follow the local calendar, not the UTC one.
    const date = new Date('2026-01-15T23:30:00.000Z');
    expect(attendanceBusinessDate(date)).toBe('2026-01-16');
  });

  it('keeps the same business date for a clock-in just before local midnight', () => {
    // 2026-06-01T22:59:00Z is 2026-06-01T23:59 in Tunis in summer (UTC+1,
    // no DST in Tunisia) — still the 1st.
    const date = new Date('2026-06-01T22:59:00.000Z');
    expect(attendanceBusinessDate(date)).toBe('2026-06-01');
  });
});
