'use client';
import { formatMinor } from '@/lib/money';
import type { PosCatalogItem } from '@/types/pos';

export default function QuickPickRail({
  title, icon, items, onSelect,
}: { title: string; icon: React.ReactNode; items: PosCatalogItem[]; onSelect: (item: PosCatalogItem) => void }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-500">
        {icon} {title}
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const outOfStock = item.stockTracked !== false && item.boutiqueAvailable <= 0;
          return (
            <button
              key={item.productId}
              type="button"
              onClick={() => !outOfStock && onSelect(item)}
              disabled={outOfStock}
              className={`group flex h-9 flex-none items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-xs transition duration-150 active:scale-95 ${
                outOfStock ? 'opacity-40 cursor-not-allowed' : 'hover:border-blue-400 hover:bg-blue-50/30 hover:shadow-xs'
              }`}
              title={item.name}
            >
              <span className="max-w-[140px] truncate text-[11.5px] font-bold text-slate-800 group-hover:text-blue-700">
                {item.name}
              </span>
              <span className="shrink-0 text-[11.5px] font-black text-emerald-600">
                {formatMinor(item.priceMinor)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
