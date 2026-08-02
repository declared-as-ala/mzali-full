'use client';
import { useEffect, useState } from 'react';
import { Plus, ShoppingBag, Sparkle } from 'lucide-react';
import { posFetch } from '@/lib/device';
import { formatMinor } from '@/lib/money';
import type { PosCatalogItem, PosCatalogResponse, PosSuggestionsResponse } from '@/types/pos';

const REASON_LABEL: Record<string, string> = {
  frequently_bought_together: 'Souvent acheté avec',
  best_seller: 'Meilleure vente',
  similar: 'Similaire',
};

/**
 * Checkout-time suggestions, driven by the last item added to the cart —
 * real completed-sale co-occurrence counts and existing best-seller/
 * related-product logic (see pos-suggestions.service.ts), never an ML
 * model, so this is never labeled "AI".
 */
export default function SuggestionsRail({ forVariantId, catalog, cartVariantIds, onAdd }: {
  forVariantId: string | null;
  catalog: PosCatalogResponse | null;
  cartVariantIds: Set<string>;
  onAdd: (item: PosCatalogItem) => void;
}) {
  const [data, setData] = useState<PosSuggestionsResponse | null>(null);

  useEffect(() => {
    if (!forVariantId) { setData(null); return; }
    let cancelled = false;
    posFetch(`/api/suggestions?variantId=${encodeURIComponent(forVariantId)}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((json: PosSuggestionsResponse) => { if (!cancelled) setData(json); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [forVariantId]);

  if (!data || !catalog) return null;

  const byVariant = new Map(catalog.items.map((i) => [i.variantId, i]));
  const seen = new Set(cartVariantIds);
  const cards = [...data.frequentlyBoughtTogether, ...data.bestSellers, ...data.similar]
    .filter((s) => {
      if (seen.has(s.variantId)) return false;
      seen.add(s.variantId);
      return byVariant.has(s.variantId);
    })
    .slice(0, 5);

  if (!cards.length) return null;

  return (
    <div className="border-t border-slate-200 bg-white px-4 py-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-400">
        <Sparkle size={12} className="text-amber-500" /> Suggestions
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {cards.map((s) => {
          const item = byVariant.get(s.variantId)!;
          return (
            <button
              key={s.variantId}
              onClick={() => onAdd(item)}
              className="group flex w-28 shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70 text-left transition hover:border-blue-300 hover:bg-blue-50/50"
            >
              <div className="relative h-16 w-full overflow-hidden bg-slate-100">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-slate-300"><ShoppingBag size={16} /></div>
                )}
                <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-white text-blue-600 shadow-sm group-hover:bg-blue-600 group-hover:text-white">
                  <Plus size={12} />
                </span>
              </div>
              <div className="p-1.5">
                <p className="truncate text-[10px] font-black text-slate-700">{item.name}</p>
                <p className="text-[9px] font-bold text-slate-400">{REASON_LABEL[s.reason]}</p>
                <p className="text-[10px] font-black text-emerald-600">{formatMinor(item.priceMinor)}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
