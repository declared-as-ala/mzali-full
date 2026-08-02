/**
 * Central money utility.
 *
 * Storage/arithmetic: integer minor units (millimes; 1 TND = 1000 millimes).
 * API edge: the storefront contract (`types/`) speaks float dinars, and the
 * UI displays whole dinars — conversion happens ONLY through these helpers.
 */

export const CURRENCY = 'TND' as const;
export const MINOR_PER_DINAR = 1000;

/** Convert float dinars (e.g. Woo "19.900") to integer millimes (19900). */
export function toMinor(dinars: number): number {
  if (!Number.isFinite(dinars)) return 0;
  return Math.round(dinars * MINOR_PER_DINAR);
}

/** Convert integer millimes back to float dinars for contract responses. */
export function toDinars(minor: number): number {
  return minor / MINOR_PER_DINAR;
}

/** Parse a Woo-style decimal string ("19.900", "19,9", "") into millimes. */
export function parseToMinor(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return toMinor(value);
  const normalized = value.replace(',', '.').trim();
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? toMinor(parsed) : 0;
}

export function addMinor(...amounts: number[]): number {
  return amounts.reduce((sum, a) => sum + assertMinor(a), 0);
}

export function subtractMinor(a: number, b: number): number {
  return assertMinor(a) - assertMinor(b);
}

export function multiplyMinor(unitMinor: number, quantity: number): number {
  return assertMinor(unitMinor) * quantity;
}

/**
 * Percentage discount on a minor amount, rounded to the nearest millime.
 * `percent` is an integer 1–100.
 */
export function percentOfMinor(amountMinor: number, percent: number): number {
  return Math.round((assertMinor(amountMinor) * percent) / 100);
}

/** Clamp a discount so it can never exceed the discountable amount. */
export function clampDiscount(discountMinor: number, subtotalMinor: number): number {
  return Math.max(0, Math.min(discountMinor, subtotalMinor));
}

function assertMinor(value: number): number {
  if (!Number.isInteger(value)) {
    throw new TypeError(`Expected integer minor units, got ${value}`);
  }
  return value;
}
