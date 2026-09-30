/**
 * Live stock rules for the admin order form (create + edit). Pure functions so the
 * limits an employee sees while on the phone are unit-tested, not trusted.
 * One inventory (DEPOT); the backend re-validates everything at save time.
 */
export type LiveVariant = { id: string; sku?: string; size: string; color: string; active: boolean; available: number };

export type LiveStock = {
  productId: string;
  name?: string;
  /** false when stock tracking is off for this product: nothing is limited. */
  tracked: boolean;
  /** VARIANT = tracked per exact variant; SIMPLE = one quantity. Derived by the server. */
  mode: 'SIMPLE' | 'VARIANT';
  /** Sum of the active variants' available stock. Informative only — never approves a sold-out variant. */
  total: number;
  variants: LiveVariant[];
  defaultVariantId: string | null;
  /** Client clock (ms) of the fetch, used to decide when a refetch is worth it. */
  fetchedAt: number;
};

const norm = (v: string) => v.trim().normalize('NFC').toLocaleLowerCase('fr');

/** Only ACTIVE variants that really exist are ever offered. */
export const sellableVariants = (s: LiveStock) => s.variants.filter((v) => v.active);

export type ColorChoice = { color: string; available: number; soldOut: boolean };

/** Colors that have at least one active variant, in first-seen order. */
export function colorChoices(s: LiveStock): ColorChoice[] {
  const out = new Map<string, ColorChoice>();
  for (const v of sellableVariants(s)) {
    const key = norm(v.color);
    const existing = out.get(key);
    out.set(key, { color: existing?.color ?? v.color, available: (existing?.available ?? 0) + v.available, soldOut: false });
  }
  return [...out.values()].map((c) => ({ ...c, soldOut: c.available <= 0 }));
}

/** Sizes that exist for a color (nonexistent or disabled combinations are simply absent). */
export function sizesForColor(s: LiveStock, color: string): LiveVariant[] {
  return sellableVariants(s).filter((v) => norm(v.color) === norm(color));
}

export function variantById(s: LiveStock | undefined, id: string | null | undefined): LiveVariant | undefined {
  return s && id ? s.variants.find((v) => v.id === id) : undefined;
}

/** How many units of THIS variant (or product) the saved order already holds. */
export function heldQuantity(saved: { productId: string; variantId?: string | null; qty: number }[], target: { productId: string; variantId?: string | null }): number {
  return saved
    .filter((l) => l.productId === target.productId && (target.variantId ? l.variantId === target.variantId : true))
    .reduce((sum, l) => sum + l.qty, 0);
}

/**
 * Highest quantity a line may take, or null when there is no limit (untracked stock, or the variant
 * has not been chosen yet). For an already-deducted order the units it holds count as free again for
 * ITS OWN lines: 5 held + 3 free => 8 may be requested (only 3 extra are taken from stock).
 */
export function maxQuantity(s: LiveStock | undefined, line: { variantId?: string | null }, held = 0): number | null {
  if (!s || !s.tracked) return null;
  if (s.mode === 'VARIANT') {
    const v = variantById(s, line.variantId);
    if (!v || !v.active) return null; // nothing chosen yet (or handled as unavailable elsewhere)
    return Math.max(0, v.available + held);
  }
  return Math.max(0, s.total + held);
}

export function limitMessage(max: number): string {
  return max <= 0 ? 'ÉPUISÉ' : `Seulement ${max} unité${max > 1 ? 's' : ''} disponible${max > 1 ? 's' : ''}.`;
}

/** Clamps a typed quantity to the limit and says why, so the employee sees it immediately (never after Save). */
export function clampQuantity(requested: number, max: number | null): { qty: number; notice: string | null } {
  const qty = Math.max(1, Math.floor(Number.isFinite(requested) ? requested : 1));
  if (max === null) return { qty, notice: null };
  if (max <= 0) return { qty: 1, notice: 'ÉPUISÉ' };
  return qty > max ? { qty: max, notice: limitMessage(max) } : { qty, notice: null };
}

/** Availability wording for a variant button: "8 disponibles", "1 disponible", "ÉPUISÉ". */
export function availabilityLabel(available: number): string {
  return available <= 0 ? 'ÉPUISÉ' : `${available} disponible${available > 1 ? 's' : ''}`;
}

/** Whether a product can be added to an order at all (every variant sold out / no stock). */
export function isSoldOut(s: LiveStock | undefined): boolean {
  return Boolean(s && s.tracked && s.total <= 0);
}

/**
 * Total requested per exact variant across all lines (bundle slots included), against what is free.
 * Returns the variants whose combined quantity exceeds availability — a bundle whose slots all pick
 * the same size must fit as a whole, not slot by slot.
 */
export function overbooked(
  lines: { productId: string; variantId?: string | null; qty: number }[],
  stocks: Record<string, LiveStock | undefined>,
  saved: { productId: string; variantId?: string | null; qty: number }[] = [],
): { productId: string; variantId: string | null; requested: number; max: number }[] {
  const wanted = new Map<string, { productId: string; variantId: string | null; requested: number }>();
  for (const l of lines) {
    const s = stocks[l.productId];
    const vid = s?.mode === 'VARIANT' ? (l.variantId ?? null) : (s?.defaultVariantId ?? l.variantId ?? null);
    const key = `${l.productId}::${s?.mode === 'VARIANT' ? vid ?? '' : 'single'}`;
    const cur = wanted.get(key);
    wanted.set(key, { productId: l.productId, variantId: vid, requested: (cur?.requested ?? 0) + l.qty });
  }
  const bad: { productId: string; variantId: string | null; requested: number; max: number }[] = [];
  for (const w of wanted.values()) {
    const s = stocks[w.productId];
    const held = heldQuantity(saved, { productId: w.productId, variantId: s?.mode === 'VARIANT' ? w.variantId : null });
    const max = maxQuantity(s, { variantId: w.variantId }, held);
    if (max !== null && w.requested > max) bad.push({ ...w, max });
  }
  return bad;
}

// ── Two-select variant picker: Couleur + Taille resolve ONE real variant ─────────────────────

export type Selection = { color: string; size: string };
export type AxisChoice = { value: string; available: number; soldOut: boolean };

/** Which selectors a product needs: an axis with no value on any sellable variant is never shown. */
export function axesOf(s: LiveStock): { color: boolean; size: boolean } {
  const vs = sellableVariants(s);
  return { color: vs.some((v) => v.color.trim() !== ''), size: vs.some((v) => v.size.trim() !== '') };
}

function choices(vs: LiveVariant[], key: 'color' | 'size'): AxisChoice[] {
  const out = new Map<string, AxisChoice>();
  for (const v of vs) {
    const k = norm(v[key]);
    const cur = out.get(k);
    out.set(k, { value: cur?.value ?? v[key], available: (cur?.available ?? 0) + v.available, soldOut: false });
  }
  return [...out.values()].map((c) => ({ ...c, soldOut: c.available <= 0 }));
}

/** Colors offered: only those that exist (with the chosen size, if any). Sold-out ones are flagged. */
export function colorOptions(s: LiveStock, size: string): AxisChoice[] {
  const vs = sellableVariants(s).filter((v) => !size || norm(v.size) === norm(size));
  return choices(vs, 'color').filter((c) => c.value.trim() !== '');
}

/** Sizes offered: only those that exist (with the chosen color, if any). Sold-out ones are flagged. */
export function sizeOptions(s: LiveStock, color: string): AxisChoice[] {
  const vs = sellableVariants(s).filter((v) => !color || norm(v.color) === norm(color));
  return choices(vs, 'size').filter((c) => c.value.trim() !== '');
}

/** The exact variant for a selection, or undefined (never a made-up one). */
export function resolveVariant(s: LiveStock, sel: Selection): LiveVariant | undefined {
  const axes = axesOf(s);
  if ((axes.color && !sel.color) || (axes.size && !sel.size)) return undefined;
  return sellableVariants(s).find((v) => (!axes.color || norm(v.color) === norm(sel.color)) && (!axes.size || norm(v.size) === norm(sel.size)));
}

/**
 * Applies one change and drops the OTHER value when it no longer forms a valid, in-stock
 * combination (e.g. size XL only exists in Blanc: choosing Noir clears XL).
 */
export function changeSelection(s: LiveStock, sel: Selection, axis: 'color' | 'size', value: string): Selection {
  const next: Selection = { ...sel, [axis]: value };
  const other = axis === 'color' ? 'size' : 'color';
  if (next[other]) {
    const v = sellableVariants(s).find((x) => norm(x.color) === norm(next.color || x.color) && norm(x.size) === norm(next.size || x.size));
    if (!v || v.available <= 0) next[other] = '';
  }
  return next;
}

/** Selection shown for an existing variant. */
export const selectionOf = (v: LiveVariant | undefined): Selection => ({ color: v?.color ?? '', size: v?.size ?? '' });

/**
 * Old order lines may carry no variantId, only {size, color}. Resolve ONLY when exactly one current
 * variant matches; otherwise undefined so the historical values are kept as they are.
 */
export function matchLegacy(s: LiveStock, variation: Record<string, string> | undefined): LiveVariant | undefined {
  if (!variation) return undefined;
  const pick = (re: RegExp) => Object.entries(variation).find(([k]) => re.test(norm(k)))?.[1] ?? '';
  const size = pick(/^(taille|tallie|taile|size|pointure)s?$/);
  const color = pick(/^(couleur|color|colour)s?$/);
  if (!size && !color) return undefined;
  const hits = sellableVariants(s).filter((v) => (!size || norm(v.size) === norm(size)) && (!color || norm(v.color) === norm(color)));
  return hits.length === 1 ? hits[0] : undefined;
}
