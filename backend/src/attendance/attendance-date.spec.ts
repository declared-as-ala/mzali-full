import { attendanceBusinessDate, tunisStartOfMonth, tunisStartOfWeek, tunisToday } from './attendance-date';

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

describe('tunisToday / tunisStartOfWeek / tunisStartOfMonth', () => {
  afterEach(() => jest.useRealTimers());

  it('tunisToday matches attendanceBusinessDate(new Date()) for "now"', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-18T10:00:00.000Z'));
    expect(tunisToday()).toBe(attendanceBusinessDate(new Date()));
    expect(tunisToday()).toBe('2026-03-18');
  });

  it('start of week is the Monday on or before today (2026-03-18 is a Wednesday)', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-18T10:00:00.000Z'));
    expect(tunisStartOfWeek()).toBe('2026-03-16');
  });

  it('start of week rolls back correctly across a Sunday', () => {
    // 2026-03-15 is a Sunday — the week it belongs to starts the previous Monday.
    jest.useFakeTimers().setSystemTime(new Date('2026-03-15T10:00:00.000Z'));
    expect(tunisStartOfWeek()).toBe('2026-03-09');
  });

  it('start of week on a Monday is that same day', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-16T10:00:00.000Z'));
    expect(tunisStartOfWeek()).toBe('2026-03-16');
  });

  it('start of month is always the 1st', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-18T10:00:00.000Z'));
    expect(tunisStartOfMonth()).toBe('2026-03-01');
  });

  it('start of month correctly rolls over at a year boundary', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-05T10:00:00.000Z'));
    expect(tunisStartOfMonth()).toBe('2026-01-01');
  });
});
