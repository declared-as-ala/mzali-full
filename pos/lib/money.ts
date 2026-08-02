/** Mirrors backend/src/common/money.ts's millimes convention — the POS
 *  cart works in integer minor units throughout, formatted only for display. */
export function formatMinor(minor: number): string {
  return `${(minor / 1000).toFixed(3)} DT`;
}
