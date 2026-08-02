'use client';
import type { PosCategory } from '@/types/pos';

export default function CategoryRail({
  categories, active, onChange,
}: { categories: PosCategory[]; active: string | null; onChange: (id: string | null) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`min-h-[40px] flex-none rounded-xl px-4 text-xs font-black tracking-wide uppercase transition duration-200 ${
          active === null
            ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
            : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
        }`}
      >
        Tous les produits
      </button>
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChange(c.id)}
          className={`min-h-[40px] flex-none rounded-xl px-4 text-xs font-black tracking-wide uppercase transition duration-200 ${
            active === c.id
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}
