/**
 * Tunisian phone normalization — the customer identity key.
 * Mirrors the loose matching the current system does by hand (digit-only
 * comparison), but canonicalizes to the 8-digit national number when the
 * input is clearly Tunisian.
 */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');
  // Strip international prefixes for Tunisia (+216 / 00216)
  if (digits.startsWith('00216')) digits = digits.slice(5);
  else if (digits.startsWith('216') && digits.length === 11) digits = digits.slice(3);
  return digits;
}

/** Loose equality used for sticky-customer lookups (same as legacy behavior). */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  return na.length > 0 && na === nb;
}
