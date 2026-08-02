/** Strip spaces, dashes, and Tunisian country-code prefix — 8 raw digits for carrier APIs. */
export function sanitizeCarrierPhone(p: string): string {
  return p.replace(/[\s\-().]/g, '').replace(/^\+?216/, '').replace(/^00216/, '').replace(/^0+/, '');
}

const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

export function normalizeCarrierString(s: string | undefined | null): string {
  if (!s) return '';
  return s.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().trim();
}
