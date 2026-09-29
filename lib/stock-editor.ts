/**
 * Pure logic behind the stock adjustment modal. One inventory (DEPOT); a product
 * either has real size/color variants (a grid) or a single quantity (one cell).
 * Kept free of React so the rules that decide what gets saved are unit-tested.
 */
export type StockVariantRow = {
  id: string;
  sku: string;
  attributes: { size?: string; color?: string };
  active: boolean;
  obsoleteByOptions?: boolean;
  onHand: number;
  reserved: number;
};

export type StockConfig = {
  productId: string;
  name: string;
  /** true when the product has real size/color variants (derived by the server, never chosen). */
  hasVariants: boolean;
  options: { label: string; values: string[] }[];
  variants: StockVariantRow[];
};

export type SaveRow = { variantId: string; quantity?: number; expectedQuantity?: number; active?: boolean };

const norm = (value?: string) => (value ?? '').trim().normalize('NFC').toLocaleLowerCase('fr');
export const cellKey = (size?: string, color?: string) => `${norm(size)}\u0000${norm(color)}`;

const SIZE_LABEL = /^(taille|tallie|taile|size|pointure)s?$/i;
const COLOR_LABEL = /^(couleur|color|colour)s?$/i;

/** Only variants that match the product's saved options can be edited or sold. */
export const editableVariants = (config: StockConfig) => config.variants.filter((v) => !v.obsoleteByOptions);

export type Grid = {
  sizes: string[];
  colors: string[];
  /** The variant for a combination, or undefined when that combination does not exist. */
  at: (size: string, color: string) => StockVariantRow | undefined;
  variants: StockVariantRow[];
};

/** Rows = colors, columns = sizes, both in the order the admin set in Options. */
export function buildGrid(config: StockConfig): Grid {
  const variants = editableVariants(config);
  const byKey = new Map(variants.map((v) => [cellKey(v.attributes.size, v.attributes.color), v]));
  const order = (axis: 'size' | 'color') => {
    const wanted = config.options.find((o) => (axis === 'size' ? SIZE_LABEL : COLOR_LABEL).test(o.label.trim()));
    const present = new Map<string, string>();
    for (const v of variants) present.set(norm(v.attributes[axis]), v.attributes[axis] ?? '');
    const out: string[] = [];
    for (const value of wanted?.values ?? []) {
      const label = present.get(norm(value));
      if (label !== undefined && !out.some((o) => norm(o) === norm(label))) out.push(label);
    }
    for (const label of present.values()) if (!out.some((o) => norm(o) === norm(label))) out.push(label);
    return out;
  };
  return { sizes: order('size'), colors: order('color'), variants, at: (size, color) => byKey.get(cellKey(size, color)) };
}

/** Accepts only a whole number >= 0. Anything else (blank, "-3", "1.5", "abc") is invalid. */
export function parseQty(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d{1,9}$/.test(text)) return null;
  return Number(text);
}

export type Draft = { qty: Record<string, string>; active: Record<string, boolean> };

export function initialDraft(config: StockConfig): Draft {
  const qty: Record<string, string> = {};
  const active: Record<string, boolean> = {};
  for (const v of editableVariants(config)) {
    qty[v.id] = String(v.onHand);
    active[v.id] = v.active;
  }
  return { qty, active };
}

export type Analysis = {
  /** Rows to send: only what actually changed. */
  rows: SaveRow[];
  changedQty: Set<string>;
  changedActive: Set<string>;
  /** Variants whose typed quantity is not a valid whole number >= 0. */
  invalid: Set<string>;
  dirty: boolean;
  canSave: boolean;
};

export function analyze(config: StockConfig, draft: Draft): Analysis {
  const rows: SaveRow[] = [];
  const changedQty = new Set<string>();
  const changedActive = new Set<string>();
  const invalid = new Set<string>();
  for (const v of editableVariants(config)) {
    const parsed = parseQty(draft.qty[v.id] ?? String(v.onHand));
    if (parsed === null) { invalid.add(v.id); continue; }
    const row: SaveRow = { variantId: v.id };
    if (parsed !== v.onHand) { row.quantity = parsed; row.expectedQuantity = v.onHand; changedQty.add(v.id); }
    const active = draft.active[v.id] ?? v.active;
    if (active !== v.active) { row.active = active; changedActive.add(v.id); }
    if (row.quantity !== undefined || row.active !== undefined) rows.push(row);
  }
  const dirty = rows.length > 0 || invalid.size > 0;
  return { rows, changedQty, changedActive, invalid, dirty, canSave: rows.length > 0 && invalid.size === 0 };
}

export type Totals = { byColor: Record<string, number>; bySize: Record<string, number>; grand: number };

/** Live totals of what is typed (an invalid cell keeps counting its saved value). */
export function totals(config: StockConfig, grid: Grid, draft: Draft): Totals {
  const value = (v: StockVariantRow) => parseQty(draft.qty[v.id] ?? '') ?? v.onHand;
  const byColor: Record<string, number> = {};
  const bySize: Record<string, number> = {};
  let grand = 0;
  for (const v of grid.variants) {
    const q = value(v);
    grand += q;
    byColor[norm(v.attributes.color)] = (byColor[norm(v.attributes.color)] ?? 0) + q;
    bySize[norm(v.attributes.size)] = (bySize[norm(v.attributes.size)] ?? 0) + q;
  }
  return { byColor, bySize, grand };
}

export const currentTotal = (config: StockConfig) => editableVariants(config).reduce((sum, v) => sum + v.onHand, 0);

/** "11 977 pièces" — narrow no-break space thousands separator, French plural rules. */
export function formatPieces(n: number): string {
  return `${n.toLocaleString('fr-FR')} ${n > 1 ? 'pièces' : 'pièce'}`;
}
