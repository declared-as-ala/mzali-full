import { orderStatusFunnel, zeroFillRevenueDays } from './stats-shaping';

describe('stats shaping', () => {
  it('zero-fills missing revenue days and converts millimes to dinars', () => {
    expect(zeroFillRevenueDays(
      [
        { date: '2026-07-15', revenueMinor: 12500, orders: 2 },
        { date: '2026-07-17', revenueMinor: 9000, orders: 1 },
      ],
      new Date('2026-07-15T00:00:00.000Z'),
      new Date('2026-07-17T23:59:59.999Z'),
    )).toEqual([
      { date: '2026-07-15', revenue: 12.5, orders: 2 },
      { date: '2026-07-16', revenue: 0, orders: 0 },
      { date: '2026-07-17', revenue: 9, orders: 1 },
    ]);
  });

  it('orders the business funnel and appends unknown statuses', () => {
    const result = orderStatusFunnel({ confirme: 8, 'checkout-draft': 12, custom: 3 });
    expect(result[0]).toEqual({ status: 'checkout-draft', count: 12 });
    expect(result.findIndex((row) => row.status === 'confirme')).toBeLessThan(
      result.findIndex((row) => row.status === 'custom'),
    );
    expect(result.at(-1)).toEqual({ status: 'custom', count: 3 });
  });
});
