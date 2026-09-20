export type StockOption = { label: string; values: string[] };
export type StockRow = { size: string; color: string; sku: string; active: boolean; depot: number; boutique: number };
export const stockCombinationKey = (size: string, color: string) => JSON.stringify([size.trim().normalize('NFC').toLocaleLowerCase('fr'), color.trim().normalize('NFC').toLocaleLowerCase('fr')]);

export function productStockRows(productId: string, options: StockOption[], previous: StockRow[] = []): StockRow[] {
  const usable = options.filter(o => o.values.some(v => v.trim()));
  const size = usable.find(o => /^(taille|tallie|taile|size|pointure)s?$/i.test(o.label.trim()));
  const color = usable.find(o => /^(couleur|color|colour)s?$/i.test(o.label.trim()));
  const sizeOption = size ?? usable.find(o => o !== color);
  const colorOption = color ?? usable.find(o => o !== sizeOption);
  if (!sizeOption || !colorOption) return [];
  const values = (items: string[]) => [...new Map(items.map(v => [v.trim().normalize('NFC').toLocaleLowerCase('fr'), v.trim()])).values()].filter(Boolean);
  return values(sizeOption.values).flatMap(size => values(colorOption.values).map(color => {
    const key = stockCombinationKey(size, color);
    const existing = previous.find(r => stockCombinationKey(r.size, r.color) === key);
    if (existing) return existing;
    let hash = 2166136261;
    for (const c of key) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
    return { size, color, sku: `${productId}-${size}-${color}`.toUpperCase().slice(0, 145) + `-${hash.toString(36)}`, active: true, depot: 0, boutique: 0 };
  }));
}
