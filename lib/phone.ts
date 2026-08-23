/**
 * Phone utilities for Tunisian numbers.
 * National format is 8 digits (typically starting with 2, 3, 4, 5, 7, or 9).
 * Also handles international prefix +216 / 00216.
 */

export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00216')) digits = digits.slice(5);
  else if (digits.startsWith('216') && digits.length === 11) digits = digits.slice(3);
  return digits;
}

export function isValidPhone(raw: string | null | undefined): boolean {
  const norm = normalizePhone(raw);
  // Valid Tunisian phone: exactly 8 digits
  return /^[234579]\d{7}$/.test(norm) || /^\d{8}$/.test(norm);
}
