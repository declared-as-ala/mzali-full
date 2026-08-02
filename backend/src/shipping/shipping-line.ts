/**
 * Shared "designation" builder used by all three carriers (they all display
 * the same product summary). Ported verbatim from lib/navex.ts
 * (buildNavexDesignation) — the exact same grouping/formatting logic the
 * legacy admin UI relies on.
 */
export type CarrierLineLike = {
  productId: string;
  name: string;
  quantity?: number;
  qty?: number;
  attributes?: { key: string; value: string }[];
  variation?: Record<string, string>;
  bundleName?: string;
  bundleId?: string;
  bundleSlot?: number;
};

function getVariationValues(it: CarrierLineLike): string[] {
  const values = new Set<string>();

  if (it.variation && Object.keys(it.variation).length > 0) {
    for (const [k, v] of Object.entries(it.variation)) {
      if (v && typeof v === 'string' && v.trim() && !/^offre$/i.test(k)) {
        const valNorm = v.trim().toLowerCase();
        if (valNorm && valNorm !== '—') values.add(valNorm);
      }
    }
  }

  if (it.attributes && it.attributes.length > 0) {
    for (const attr of it.attributes) {
      if (!attr.key || !attr.value) continue;
      const keyNorm = attr.key.trim().toLowerCase();
      if (keyNorm === 'offre') continue;

      if (/^item\s*\d+/i.test(keyNorm)) {
        const parts = attr.value.split(/[·;,]/);
        for (const part of parts) {
          const colonIdx = part.indexOf(':');
          const val = colonIdx !== -1 ? part.slice(colonIdx + 1).trim() : part.trim();
          const valNorm = val.toLowerCase().trim();
          if (valNorm && valNorm !== '—') values.add(valNorm);
        }
      } else {
        const valNorm = attr.value.trim().toLowerCase();
        if (valNorm && valNorm !== '—') values.add(valNorm);
      }
    }
  }

  return Array.from(values);
}

export function buildCarrierDesignation(items: CarrierLineLike[]): { designation: string; nbArticle: number } {
  if (!items || items.length === 0) return { designation: '', nbArticle: 1 };

  const parts: string[] = [];
  let totalArticles = 0;

  for (const it of items) {
    const qty = it.quantity ?? it.qty ?? 1;
    totalArticles += qty;
    const name = it.name.toLowerCase().trim();
    const vars = getVariationValues(it);
    const varsStr = vars.length > 0 ? ` (${vars.join(', ')})` : '';
    parts.push(`${name}${varsStr} x ${qty}`);
  }

  const designation = parts.join(' | ').slice(0, 200);
  return { designation, nbArticle: Math.max(1, totalArticles) };
}
