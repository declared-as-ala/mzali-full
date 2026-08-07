'use client';
import { PackageX, ShoppingBag } from 'lucide-react';
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
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 pb-4">
      {items.map((item) => {
        const outOfStock = item.boutiqueAvailable <= 0;
        return (
          <button
            key={item.productId}
            type="button"
            onClick={() => (outOfStock ? onUnavailableAttempt?.(item) : onSelect(item))}
            className={`group relative flex min-h-[150px] flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white text-left shadow-sm transition duration-200 ease-out active:scale-[.97] ${
              outOfStock ? 'opacity-40 hover:opacity-60' : 'hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-slate-900/5'
            }`}
          >
            <div className="relative h-24 w-full shrink-0 overflow-hidden bg-slate-100">
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" draggable={false} />
              ) : (
                <div className="grid h-full w-full place-items-center text-slate-400 text-[10px] font-semibold">
                  <ShoppingBag size={18} className="mb-0.5 text-slate-300" />
                  Mzali Product
                </div>
              )}
              <span
                className={`absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-black tracking-wider uppercase shadow-sm ${
                  outOfStock
                    ? 'bg-rose-500 text-white'
                    : item.boutiqueAvailable <= 3
                    ? 'bg-amber-500 text-white'
                    : 'bg-white/95 text-emerald-700 border border-emerald-200'
                }`}
              >
                {outOfStock ? 'Épuisé' : item.boutiqueAvailable}
              </span>
            </div>
            <div className="flex flex-1 flex-col justify-between gap-1 p-2">
              <p className="line-clamp-2 text-[11.5px] font-bold leading-tight text-slate-800 group-hover:text-blue-600 transition">{item.name}</p>
              <p className="text-[13px] font-black text-emerald-600">{formatMinor(item.priceMinor)}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
