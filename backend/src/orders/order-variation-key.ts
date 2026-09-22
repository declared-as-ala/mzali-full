/**
 * Deterministic, normalized "size|color" matching key used to find orders
 * by product + variant across BOTH storage generations:
 *  - new orders: `items[].variantId` set directly (Sprint 4+)
 *  - legacy orders: `items[].variantId` is null, only a free-form
 *    `items[].variation` snapshot exists (e.g. `{Taille: 'XL', Couleur: 'Noir'}`,
 *    `{size: 'xl', color: 'noir'}`, `{SIZE: 'XL', COLOR: 'NOIR'}` — key
 *    casing/spelling is genuinely inconsistent across order eras in the
 *    live dataset, confirmed in code, not hypothetical).
 *
 * Reuses the exact same key-name and value normalization rules
 * `InventoryService.resolveHistoricalVariant` already trusts for
 * historical stock-movement reconciliation
 * (backend/src/inventory/inventory.service.ts), so a legacy order matches
 * a current variant here if and only if it would also resolve to that
 * variant there — one normalization definition, not two that could drift
 * apart. A naive case-sensitive string match would silently under-match
 * legacy orders.
 *
 * `variationKey` is computed once at order-write time (Order schema
 * pre-save hook, see order.schema.ts) and stored denormalized on each
 * item so it can be matched with a plain indexed equality check in the
 * orders list/filter aggregation, rather than re-normalizing on every
 * query across tens of thousands of orders.
 */
const SIZE_KEY = /^(taille|tallie|taile|size|pointure)s?$/;
const COLOR_KEY = /^(couleur|color|colour)s?$/;

function normalize(value: string): string {
  return value.trim().normalize('NFC').toLocaleLowerCase('fr');
}

/** From an order item's free-form `variation` snapshot. Null when it isn't an unambiguous single size+color pair (e.g. a product without variants, or a snapshot missing one of the two). */
export function computeVariationKey(variation: Record<string, string> | null | undefined): string | null {
  const entries = Object.entries(variation ?? {}).filter(([, v]) => typeof v === 'string' && v.trim());
  const sizes = entries.filter(([k]) => SIZE_KEY.test(normalize(k))).map(([, v]) => normalize(v));
  const colors = entries.filter(([k]) => COLOR_KEY.test(normalize(k))).map(([, v]) => normalize(v));
  if (sizes.length !== 1 || colors.length !== 1) return null;
  return `${sizes[0]}|${colors[0]}`;
}

/** From a current Variant's `attributes` (canonical lowercase `size`/`color` keys). Null when the variant has no size/color attributes at all (e.g. a non-matrix product's single default variant). */
export function computeVariantVariationKey(attributes: Record<string, string> | null | undefined): string | null {
  const size = attributes?.size?.trim();
  const color = attributes?.color?.trim();
  if (!size || !color) return null;
  return `${normalize(size)}|${normalize(color)}`;
}
