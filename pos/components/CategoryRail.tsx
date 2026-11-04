'use client';
import type { PosCategory } from '@/types/pos';

export default function CategoryRail({
  categories,
  active,
  onChange,
}: {
  categories: PosCategory[];
  active: string | null;
  onChange: (id: string | null) => void;
}) {
  if (!categories || categories.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
      {categories.map((c) => {
        const isSelected = active === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(isSelected ? null : c.id)}
            className={`min-h-[30px] py-1 flex-none rounded-lg px-2.5 sm:px-3 text-[11px] sm:text-xs font-bold tracking-wide uppercase transition duration-150 whitespace-nowrap cursor-pointer ${
              isSelected
                ? 'bg-blue-600 text-white shadow-xs'
                : 'border border-slate-200/90 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            {c.name}
          </button>
        );
      })}
    </div>
  );
}
