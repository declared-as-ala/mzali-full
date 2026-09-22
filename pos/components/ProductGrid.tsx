'use client';
import { PackageX } from 'lucide-react';
import { formatMinor } from '@/lib/money';
import type { PosCatalogItem } from '@/types/pos';

export default function ProductGrid({ items, onSelect, onUnavailableAttempt }: {
  items: PosCatalogItem[]; onSelect: (item: PosCatalogItem) => void; onUnavailableAttempt?: (item: PosCatalogItem) => void;
}) {
  if (!items.length) {
    return (
      <div className="grid h-64 place-items-center rounded-3xl border-2 border-dashed border-slate-200 bg-white/60 text-slate-400">
        <div className="text-center">
          <PackageX size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="font-bold text-slate-600">Aucun produit trouvé.</p>
          <p className="text-xs text-slate-400 mt-1">Essayez un autre mot-clé ou filtre de catégorie.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 pb-4">
      {items.map((item) => {
        const outOfStock = item.stockTracked !== false && item.boutiqueAvailable <= 0;
        return (
          <button
            key={item.productId}
            type="button"
            onClick={() => (outOfStock ? onUnavailableAttempt?.(item) : onSelect(item))}
            className={`group relative flex min-h-[80px] sm:min-h-[90px] flex-col justify-between rounded-xl border p-2.5 sm:p-3 text-left shadow-sm transition duration-150 ease-out active:scale-[.97] ${
              outOfStock
                ? 'border-slate-200 bg-slate-50/70 opacity-40 hover:opacity-60'
                : 'border-slate-200/90 bg-white hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-50/30 hover:shadow-md hover:shadow-slate-900/5'
            }`}
          >
            <div className="flex items-start justify-between gap-1.5">
              <p className="line-clamp-2 text-[11px] sm:text-[12.5px] font-bold leading-tight text-slate-800 group-hover:text-blue-700 transition-colors">
                {item.name}
              </p>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] sm:text-[10px] font-black tracking-wider uppercase shadow-sm ${
                  outOfStock
                    ? 'bg-rose-100 text-rose-700'
                    : item.boutiqueAvailable <= 3
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {item.stockTracked === false ? '✓' : outOfStock ? 'Épuisé' : item.boutiqueAvailable}
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-[13px] sm:text-[14px] font-black text-emerald-600">
                {formatMinor(item.priceMinor)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
