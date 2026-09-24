import { rangeToUtcBounds, resolveDeliveryRevenueRange, tunisLastMonthRange, tunisStartOfWeek, tunisStartOfYear, tunisYesterday } from './delivery-revenue-date';

describe('resolveDeliveryRevenueRange', () => {
  afterEach(() => jest.useRealTimers());

  it('defaults to today when nothing is passed', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-18T10:00:00.000Z'));
    expect(resolveDeliveryRevenueRange(undefined)).toEqual({ from: '2026-03-18', to: '2026-03-18' });
  });

  it('"yesterday" resolves to the previous Tunis calendar day', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-18T10:00:00.000Z'));
    expect(resolveDeliveryRevenueRange('yesterday')).toEqual({ from: '2026-03-17', to: '2026-03-17' });
  });

  it('handles the yesterday-across-a-month-boundary edge case', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-01T10:00:00.000Z'));
    expect(tunisYesterday()).toBe('2026-02-28');
  });

  it('"thisWeek" starts on Monday and ends today', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-18T10:00:00.000Z')); // Wednesday
    expect(resolveDeliveryRevenueRange('thisWeek')).toEqual({ from: '2026-03-16', to: '2026-03-18' });
  });

  it('"thisMonth" starts on the 1st', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-18T10:00:00.000Z'));
    expect(resolveDeliveryRevenueRange('thisMonth')).toEqual({ from: '2026-03-01', to: '2026-03-18' });
  });

  it('"lastMonth" is the full previous calendar month', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-18T10:00:00.000Z'));
    expect(tunisLastMonthRange()).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('"lastMonth" rolls over a year boundary correctly (January)', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-15T10:00:00.000Z'));
    expect(tunisLastMonthRange()).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('"thisYear" starts on January 1st', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-01T10:00:00.000Z'));
    expect(tunisStartOfYear()).toBe('2026-01-01');
    expect(resolveDeliveryRevenueRange('thisYear')).toEqual({ from: '2026-01-01', to: '2026-08-01' });
  });

  it('an explicit from/to always wins, even without preset="custom"', () => {
    expect(resolveDeliveryRevenueRange(undefined, '2026-01-01', '2026-01-15')).toEqual({ from: '2026-01-01', to: '2026-01-15' });
  });

  it('week start on a Sunday rolls back to the previous Monday', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-15T10:00:00.000Z')); // Sunday
    expect(tunisStartOfWeek()).toBe('2026-03-09');
  });
});

describe('rangeToUtcBounds', () => {
  it('converts a Tunis-local inclusive date range into UTC {start, endExclusive} an hour ahead', () => {
    const { start, endExclusive } = rangeToUtcBounds({ from: '2026-03-01', to: '2026-03-01' });
    expect(start.toISOString()).toBe('2026-02-28T23:00:00.000Z'); // 2026-03-01T00:00 Tunis (UTC+1)
    expect(endExclusive.toISOString()).toBe('2026-03-01T23:00:00.000Z'); // 2026-03-02T00:00 Tunis
  });

  it('a multi-day range spans from the first day\'s start to the day AFTER the last day', () => {
    const { start, endExclusive } = rangeToUtcBounds({ from: '2026-03-01', to: '2026-03-05' });
    expect(start.toISOString()).toBe('2026-02-28T23:00:00.000Z');
    expect(endExclusive.toISOString()).toBe('2026-03-05T23:00:00.000Z'); // 2026-03-06T00:00 Tunis
  });
});
