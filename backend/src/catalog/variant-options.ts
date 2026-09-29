/**
 * Single definition of "which size/color combinations are currently
 * purchasable" for a MATRIX product.
 *
 * Rule: the product's saved `options[]` (edited in Admin → Produit → Options)
 * are the source of truth. A variant may only be sold if its size AND color
 * are both current option values. Everything else — variants created for
 * values that were later removed — is history: kept (orders, stock movements
 * and stock ledger still reference it) but never sold.
 *
 * Normalization here is for COMPARISON ONLY (NFC + trim + fr-lowercase). It
 * never produces a label anyone sees, and it is exact-match: "blanc bl gris"
 * and "blanc gris" are different values and are never merged.
 *
 * Mirrors lib/product-stock-options.ts (admin matrix) — keep the two label
 * rules in sync.
 */
export type OptionLike = { label: string; values: string[] };

export const normalizeOptionValue = (value: string): string =>
  value.trim().normalize('NFC').toLocaleLowerCase('fr');

export const combinationKey = (size: string, color: string): string =>
  JSON.stringify([normalizeOptionValue(size), normalizeOptionValue(color)]);

/** Drops blanks and case/space-insensitive duplicates, keeping the FIRST
 *  value exactly as the admin typed it (trimmed only). */
export function dedupeOptionValues(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    const key = normalizeOptionValue(value);
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

const SIZE_LABEL = /^(taille|tallie|taile|size|pointure)s?$/i;
const COLOR_LABEL = /^(couleur|color|colour)s?$/i;

/** Which option is the size axis and which the color axis; null when the
 *  product doesn't have two usable options (then nothing can be judged
 *  obsolete, so callers must leave variants alone). */
export function resolveAxes(options: OptionLike[]): { size: string[]; color: string[] } | null {
  const usable = options.filter((o) => o.values.some((v) => v.trim()));
  const color = usable.find((o) => COLOR_LABEL.test(o.label.trim()));
  const size = usable.find((o) => SIZE_LABEL.test(o.label.trim()));
  const sizeOption = size ?? usable.find((o) => o !== color);
  const colorOption = color ?? usable.find((o) => o !== sizeOption);
  if (!sizeOption || !colorOption) return null;
  return { size: dedupeOptionValues(sizeOption.values), color: dedupeOptionValues(colorOption.values) };
}

/** Every combination that is valid RIGHT NOW, or null if undeterminable. */
export function validCombinationKeys(options: OptionLike[]): Set<string> | null {
  const axes = resolveAxes(options);
  if (!axes) return null;
  const keys = new Set<string>();
  for (const size of axes.size) for (const color of axes.color) keys.add(combinationKey(size, color));
  return keys;
}
