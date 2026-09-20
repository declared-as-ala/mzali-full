/** A session keeps its opening business date, including work after midnight. */
export function cashBusinessDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function expectedCash(s: { openingCashMinor: number; cashSalesMinor: number; cashMovementsAddMinor: number; cashMovementsRemoveMinor: number; cashRefundsMinor?: number }): number {
  return s.openingCashMinor + s.cashSalesMinor + s.cashMovementsAddMinor - s.cashMovementsRemoveMinor - (s.cashRefundsMinor ?? 0);
}

export function validateCash(amount: number): boolean {
  return Number.isSafeInteger(amount) && amount >= 0;
}
