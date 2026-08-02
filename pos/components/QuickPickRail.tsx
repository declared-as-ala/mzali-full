'use client';
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
      <div className="flex gap-2.5 overflow-x-auto pb-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const outOfStock = item.boutiqueAvailable <= 0;
          return (
            <button
              key={item.productId}
              type="button"
              onClick={() => !outOfStock && onSelect(item)}
              disabled={outOfStock}
              className={`group flex h-14 w-14 flex-none items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-200 active:scale-95 ${
                outOfStock ? 'opacity-30 cursor-not-allowed' : 'hover:border-slate-300 hover:shadow-md'
              }`}
              title={item.name}
            >
              <div className="h-full w-full overflow-hidden bg-slate-50">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover transition-transform group-hover:scale-110" draggable={false} />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-slate-500">
                    {item.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
