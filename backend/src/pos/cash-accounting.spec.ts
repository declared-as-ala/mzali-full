import { cashBusinessDate, expectedCash, validateCash } from './cash-accounting';
import { consolidateDay } from './pos-daily-z.service';
import { roleHasPermission } from '@/auth/permissions';

describe('Cash accounting', () => {
  it('matches the requested cash example in integer millimes', () => {
    const s = { openingCashMinor: 200000, cashSalesMinor: 0, cashMovementsAddMinor: 0, cashMovementsRemoveMinor: 0, cashRefundsMinor: 0 };
    s.cashSalesMinor += 25000; expect(expectedCash(s)).toBe(225000);
    s.cashSalesMinor += 33000; expect(expectedCash(s)).toBe(258000);
    expect(expectedCash({ ...s, cardSalesMinor: 100000 } as typeof s)).toBe(258000);
    s.cashRefundsMinor = 20000; expect(expectedCash(s)).toBe(238000);
    s.cashMovementsRemoveMinor = 30000; expect(expectedCash(s)).toBe(208000);
    expect(205000 - expectedCash(s)).toBe(-3000);
  });
  it('uses Tunis midnight rather than UTC midnight', () => {
    expect(cashBusinessDate(new Date('2026-09-14T23:30:00Z'))).toBe('2026-09-15');
  });
  it.each([-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid money %s', (n) => expect(validateCash(n)).toBe(false));
  it('keeps manager cash adjustments separate from cashier drawer permission', () => {
    expect(roleHasPermission('cashier', 'pos.open_cash_drawer')).toBe(true);
    expect(roleHasPermission('cashier', 'pos.sessions.review')).toBe(false);
    expect(roleHasPermission('store_manager', 'pos.sessions.review')).toBe(true);
  });
  it('does not invent totals for an empty consolidation', () => {
    const day = consolidateDay('2026-09-14', []);
    expect(day.totals.netSalesMinor).toBe(0);
    expect(day.firstReceiptNumber).toBeNull();
  });
});
