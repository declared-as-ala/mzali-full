'use client';
import { useEffect, useState } from 'react';
import { ShoppingBag, Trophy } from 'lucide-react';
import { posFetch } from '@/lib/device';
import { formatMinor } from '@/lib/money';
import type { PosDashboardTopProduct } from '@/types/pos';

const PERIODS: { key: 'today' | 'last7' | 'thisMonth'; label: string }[] = [
  { key: 'today', label: "Aujourd'hui" },
  { key: 'last7', label: '7 derniers jours' },
  { key: 'thisMonth', label: 'Ce mois' },
];

export default function TopProductsPanel() {
  const [period, setPeriod] = useState<'today' | 'last7' | 'thisMonth'>('today');
  const [items, setItems] = useState<PosDashboardTopProduct[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    posFetch(`/api/dashboard/top-products?period=${period}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: PosDashboardTopProduct[]) => { if (!cancelled) setItems(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [period]);

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-black text-slate-900">
          <Trophy size={16} className="text-amber-500" /> Top produits vendus
        </h2>
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${
                period === p.key ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>
      ) : !items?.length ? (
        <div className="grid h-40 place-items-center rounded-2xl border-2 border-dashed border-slate-200 text-center">
          <div>
            <ShoppingBag size={22} className="mx-auto mb-2 text-slate-300" />
            <p className="text-xs font-bold text-slate-400">Aucune vente sur cette période.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((p) => (
            <div key={p.variantId ?? p.productId} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-2.5 hover:border-slate-200">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-black text-slate-500">{p.rank}</span>
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-slate-300"><ShoppingBag size={16} /></div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-800">{p.name}</p>
                <p className="text-[11px] text-slate-400">{p.sku ?? '—'} · Stock boutique: {p.boutiqueStock}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-black text-slate-900">{p.qtySold} vendu{p.qtySold > 1 ? 's' : ''}</p>
                <p className="text-[11px] font-bold text-emerald-600">{formatMinor(p.revenueMinor)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
