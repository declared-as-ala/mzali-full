'use client';
import type { PosCategory } from '@/types/pos';

export default function CategoryRail({
  categories, active, onChange,
}: { categories: PosCategory[]; active: string | null; onChange: (id: string | null) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 px-0.5 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent hover:scrollbar-thumb-slate-400">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`min-h-[42px] flex-none rounded-xl px-4 text-xs font-black tracking-wide uppercase transition duration-200 whitespace-nowrap ${
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
          className={`min-h-[42px] flex-none rounded-xl px-4 text-xs font-black tracking-wide uppercase transition duration-200 whitespace-nowrap ${
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
