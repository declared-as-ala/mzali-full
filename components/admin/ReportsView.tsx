'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpDown,
  BarChart3,
  Boxes,
  DollarSign,
  Download,
  Package,
  PackageX,
  Pencil,
  Percent,
  Printer,
  RefreshCw,
  Search,
  ShoppingBasket,
  TrendingUp,
  X,
} from 'lucide-react';
import ProductDrawer from './ProductDrawer';

type MarginRow = {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  imageUrl: string | null;
  quantitySold: number;
  sellingPrice: number;
  purchasePrice: number | null;
  purchasePriceMissing: boolean;
  revenue: number;
  totalPurchaseCost: number | null;
  profit: number | null;
  marginPercent: number | null;
  currentStock: number;
  variantId: string | null;
  channel: 'pos' | 'online' | 'mixed';
};

type SortKey = 'revenueHigh' | 'profitHigh' | 'marginHigh' | 'qtyHigh' | 'profitLow';

function formatDinars(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return '—';
  return `${v.toFixed(3)} DT`;
}

function marginBadge(percent: number | null) {
  if (percent == null) {
    return <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-black text-slate-500">Non défini</span>;
  }
  if (percent >= 30) {
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-black text-emerald-700">{percent.toFixed(1)}%</span>;
  }
  if (percent >= 15) {
    return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-black text-amber-700">{percent.toFixed(1)}%</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-xs font-black text-rose-700">{percent.toFixed(1)}%</span>;
}

export default function ReportsView() {
  const [periodMode, setPeriodMode] = useState<'preset' | 'custom'>('preset');
  const [days, setDays] = useState(30);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [channel, setChannel] = useState<'all' | 'pos' | 'online'>('all');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('revenueHigh');

  const [rows, setRows] = useState<MarginRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [editProductId, setEditProductId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (periodMode === 'custom' && customFrom) {
      params.set('from', customFrom);
      if (customTo) params.set('to', customTo);
    } else {
      params.set('days', String(days));
    }
    if (channel !== 'all') params.set('channel', channel);
    fetch(`/api/admin/stats/margin?${params.toString()}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [days, periodMode, customFrom, customTo, channel]);

  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.category).filter(Boolean))).sort(), [rows]);
  const products = useMemo(() => Array.from(new Set(rows.map((r) => r.productName).filter(Boolean))).sort(), [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (search && !r.productName.toLowerCase().includes(search.toLowerCase()) && !r.sku.toLowerCase().includes(search.toLowerCase())) return false;
      if (selectedCategory && r.category !== selectedCategory) return false;
      if (selectedProduct && r.productName !== selectedProduct) return false;
      return true;
    });
  }, [rows, search, selectedCategory, selectedProduct]);

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows];
    copy.sort((a, b) => {
      if (sortBy === 'revenueHigh') return b.revenue - a.revenue;
      if (sortBy === 'profitHigh') return (b.profit ?? -Infinity) - (a.profit ?? -Infinity);
      if (sortBy === 'profitLow') return (a.profit ?? Infinity) - (b.profit ?? Infinity);
      if (sortBy === 'marginHigh') return (b.marginPercent ?? -Infinity) - (a.marginPercent ?? -Infinity);
      return b.quantitySold - a.quantitySold;
    });
    return copy;
  }, [filteredRows, sortBy]);

  const kpis = useMemo(() => {
    const totalRevenue = filteredRows.reduce((s, r) => s + r.revenue, 0);
    const totalPurchaseCost = filteredRows.reduce((s, r) => s + (r.totalPurchaseCost ?? 0), 0);
    const totalProfit = filteredRows.reduce((s, r) => s + (r.profit ?? 0), 0);
    const avgMarginPct = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const bestSelling = [...filteredRows].sort((a, b) => b.quantitySold - a.quantitySold)[0] ?? null;
    const mostProfitable = [...filteredRows].filter((r) => r.profit != null).sort((a, b) => (b.profit as number) - (a.profit as number))[0] ?? null;
    return { totalRevenue, totalPurchaseCost, totalProfit, avgMarginPct, bestSelling, mostProfitable };
  }, [filteredRows]);

  function exportCSV() {
    const headers = ['Produit', 'SKU', 'Catégorie', 'Qté vendue', "Prix d'achat", 'Prix de vente', 'CA (DT)', 'Coût total (DT)', 'Profit (DT)', 'Marge %', 'Stock'];
    const csvContent = [
      headers.join(','),
      ...sortedRows.map((r) => [
        `"${r.productName.replace(/"/g, '""')}"`,
        `"${r.sku}"`,
        `"${r.category}"`,
        r.quantitySold,
        r.purchasePrice != null ? r.purchasePrice.toFixed(3) : 'non défini',
        r.sellingPrice.toFixed(3),
        r.revenue.toFixed(3),
        r.totalPurchaseCost != null ? r.totalPurchaseCost.toFixed(3) : '',
        r.profit != null ? r.profit.toFixed(3) : '',
        r.marginPercent != null ? `${r.marginPercent.toFixed(1)}%` : '',
        r.currentStock,
      ].join(',')),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `marge_${days}j_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8 space-y-6 select-none">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-600 mb-1">
            <BarChart3 size={15} /> Rapports
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight sm:text-4xl">Marge</h1>
          <p className="mt-1 text-sm text-slate-600 max-w-2xl">Revenu, coût d&apos;achat et profit par produit.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition">
            <Download size={15} /> Exporter (CSV)
          </button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-slate-800 transition">
            <Printer size={15} /> Imprimer / PDF
          </button>
        </div>
      </header>

      {/* Filters */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={periodMode === 'custom' ? 'custom' : days}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'custom') {
                setPeriodMode('custom');
                if (!customFrom) {
                  const todayStr = new Date().toISOString().slice(0, 10);
                  setCustomFrom(todayStr);
                  setCustomTo(todayStr);
                }
              } else {
                setPeriodMode('preset');
                setDays(Number(val));
              }
            }}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
          >
            <option value={1}>Aujourd&apos;hui</option>
            <option value={7}>7 derniers jours</option>
            <option value={30}>30 derniers jours</option>
            <option value={3650}>Tout</option>
            <option value="custom">Période personnalisée</option>
          </select>

          {periodMode === 'custom' && (
            <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/60 p-1.5">
              <label className="flex items-center gap-1 text-xs font-bold text-blue-900">
                Du:
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold outline-none" />
              </label>
              <label className="flex items-center gap-1 text-xs font-bold text-blue-900">
                Au:
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold outline-none" />
              </label>
            </div>
          )}

          <select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer">
            <option value="all">Tous les canaux</option>
            <option value="pos">Caisse (POS)</option>
            <option value="online">En ligne</option>
          </select>

          {categories.length > 0 && (
            <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer">
              <option value="">Toutes les catégories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}

          {products.length > 0 && (
            <select value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer max-w-[200px]">
              <option value="">Tous les produits</option>
              {products.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}

          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher par produit ou SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-8 py-2 text-xs font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-brand-500"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                <X size={14} />
              </button>
            )}
          </div>

          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Actualiser
          </button>
        </div>
      </section>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard title="CA Total" value={formatDinars(kpis.totalRevenue)} icon={<DollarSign size={20} className="text-blue-600" />} color="blue" />
        <KpiCard title="Coût d'achat total" value={formatDinars(kpis.totalPurchaseCost)} icon={<Boxes size={20} className="text-slate-600" />} color="slate" />
        <KpiCard title="Profit total" value={formatDinars(kpis.totalProfit)} icon={<TrendingUp size={20} className="text-emerald-600" />} color="emerald" />
        <KpiCard title="Marge moyenne" value={`${kpis.avgMarginPct.toFixed(1)}%`} icon={<Percent size={20} className="text-violet-600" />} color="violet" />
        <KpiCard
          title="Meilleure vente"
          value={kpis.bestSelling ? kpis.bestSelling.productName : '—'}
          subtitle={kpis.bestSelling ? `${kpis.bestSelling.quantitySold} unités` : ''}
          icon={<ShoppingBasket size={20} className="text-indigo-600" />}
          color="indigo"
        />
        <KpiCard
          title="Plus rentable"
          value={kpis.mostProfitable ? kpis.mostProfitable.productName : '—'}
          subtitle={kpis.mostProfitable ? formatDinars(kpis.mostProfitable.profit) : ''}
          icon={<TrendingUp size={20} className="text-amber-600" />}
          color="amber"
        />
      </div>

      {/* Table */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2">
            <ArrowUpDown size={15} className="text-brand-600" />
            <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Trier par:</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer">
              <option value="revenueHigh">CA le plus élevé</option>
              <option value="profitHigh">Profit le plus élevé</option>
              <option value="marginHigh">Marge % la plus élevée</option>
              <option value="qtyHigh">Quantité vendue</option>
              <option value="profitLow">Profit le plus faible</option>
            </select>
          </div>
          <div className="text-xs font-bold text-slate-500">{sortedRows.length} produit{sortedRows.length !== 1 ? 's' : ''}</div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-slate-100" />)}
            </div>
          ) : sortedRows.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <PackageX size={32} className="mx-auto mb-3 text-slate-400" />
              <p className="text-base font-bold text-slate-900">Aucune vente sur cette période</p>
              <p className="text-xs text-slate-500 mt-1">Modifiez les filtres pour afficher des résultats.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3.5">Produit</th>
                    <th className="px-4 py-3.5">Catégorie</th>
                    <th className="px-4 py-3.5 text-center">Qté vendue</th>
                    <th className="px-4 py-3.5 text-right">Prix d&apos;achat</th>
                    <th className="px-4 py-3.5 text-right">Prix de vente</th>
                    <th className="px-4 py-3.5 text-right">CA</th>
                    <th className="px-4 py-3.5 text-right">Coût total</th>
                    <th className="px-4 py-3.5 text-right">Profit</th>
                    <th className="px-4 py-3.5 text-center">Marge %</th>
                    <th className="px-4 py-3.5 text-center">Stock</th>
                    <th className="px-4 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedRows.map((r) => (
                    <tr key={r.productId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3.5 font-bold text-slate-900">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 shrink-0 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden grid place-items-center">
                            {r.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.imageUrl} alt={r.productName} className="h-full w-full object-cover" />
                            ) : (
                              <Package size={16} className="text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-extrabold text-slate-900 truncate max-w-[200px]">{r.productName}</p>
                            <p className="text-[10px] font-mono text-slate-400">{r.sku}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs font-bold text-slate-700">{r.category}</td>
                      <td className="px-4 py-3.5 text-center font-black tabular-nums text-slate-900">{r.quantitySold}</td>
                      <td className="px-4 py-3.5 text-right">
                        {r.purchasePriceMissing ? (
                          <div className="flex flex-col items-end gap-1">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600">
                              <AlertCircle size={11} /> Prix d&apos;achat non défini
                            </span>
                            <button
                              onClick={() => setEditProductId(r.productId)}
                              className="text-[10px] font-black text-brand-600 hover:underline"
                            >
                              Définir le prix d&apos;achat
                            </button>
                          </div>
                        ) : (
                          <span className="font-mono text-xs font-semibold text-slate-600">{formatDinars(r.purchasePrice)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs font-bold text-slate-900">{formatDinars(r.sellingPrice)}</td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs font-black text-blue-700">{formatDinars(r.revenue)}</td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs font-semibold text-slate-600">{formatDinars(r.totalPurchaseCost)}</td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs font-black text-emerald-700">{formatDinars(r.profit)}</td>
                      <td className="px-4 py-3.5 text-center">{marginBadge(r.marginPercent)}</td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`inline-flex items-center justify-center min-w-[28px] rounded-full px-2 py-0.5 text-xs font-black ${r.currentStock === 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-800'}`}>
                          {r.currentStock}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          onClick={() => setEditProductId(r.productId)}
                          title="Modifier le produit"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
                        >
                          <Pencil size={12} /> Modifier
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ProductDrawer
        open={editProductId !== null}
        onClose={() => setEditProductId(null)}
        productId={editProductId}
        onSaved={() => { setEditProductId(null); load(); }}
      />
    </div>
  );
}

function KpiCard({ title, value, subtitle, icon, color }: { title: string; value: string; subtitle?: string; icon: React.ReactNode; color: string }) {
  const bgMap: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-100',
    slate: 'bg-slate-100 border-slate-200',
    emerald: 'bg-emerald-50 border-emerald-100',
    violet: 'bg-violet-50 border-violet-100',
    amber: 'bg-amber-50 border-amber-100',
    indigo: 'bg-indigo-50 border-indigo-100',
  };
  return (
    <div className={`rounded-2xl p-4 border ${bgMap[color] ?? 'bg-slate-50 border-slate-200'} space-y-2`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 truncate">{title}</span>
        {icon}
      </div>
      <div>
        <p className="text-xl font-black text-slate-900 truncate">{value}</p>
        {subtitle && <p className="text-[11px] font-bold text-slate-500 truncate mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}
