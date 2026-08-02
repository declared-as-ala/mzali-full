'use client';
import { useState, useTransition, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Package, AlertTriangle, History, Search, Truck,
  Download, SlidersHorizontal, TrendingUp, TrendingDown,
  BarChart3, Boxes, Store, X, ChevronLeft, ChevronRight,
  ArrowUpDown, RefreshCw, Settings2, MoreHorizontal,
  Minus, Plus, ExternalLink, Archive, Activity,
  CheckCircle2, Clock, Eye,
} from 'lucide-react';
import { useToast } from './Toast';
import type { InventoryItem, StockMovement } from '@/types/inventory';

// ─── Constants ────────────────────────────────────────────────────────────────
const MOVEMENT_LABEL: Record<string, string> = {
  migration_init: 'Import initial',
  manual_adjust: 'Ajustement manuel',
  order_reserve: 'Réservation (commande)',
  order_release: 'Libération (annulation)',
  order_commit: 'Confirmation (vente)',
  correction: 'Correction',
  pos_sale: 'Vente POS',
  purchase_receipt: 'Réception achat',
  return_restock: 'Retour en stock',
  refund_restock: 'Remboursement stock',
  exchange_out: 'Échange (sortie)',
  exchange_in: 'Échange (entrée)',
  transfer_out: 'Transfert (sortie)',
  transfer_in: 'Transfert (entrée)',
  damage: 'Dommage',
  loss: 'Perte',
  stocktake_correction: 'Correction inventaire',
  supplier_return: 'Retour fournisseur',
};

const PAGE_SIZES = [10, 25, 50, 100];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function stockBadge(value: number, low: boolean) {
  if (value === 0)
    return (
      <span className="inline-flex items-center justify-center min-w-[28px] rounded-full bg-red-100 px-2 py-0.5 text-xs font-black text-red-600">
        0
      </span>
    );
  if (low)
    return (
      <span className="inline-flex items-center gap-1 justify-center min-w-[28px] rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-700">
        <AlertTriangle size={10} />
        {value}
      </span>
    );
  return (
    <span className="inline-flex items-center justify-center min-w-[28px] rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-black text-emerald-700">
      {value}
    </span>
  );
}

function neutralBadge(value: number) {
  if (value === 0) return <span className="text-ink-300 font-medium">—</span>;
  return <span className="font-semibold text-ink-900">{value}</span>;
}

function SortIcon({ col, currentSort, dir }: { col: string; currentSort: string; dir: 'asc' | 'desc' }) {
  if (currentSort !== col) return <ArrowUpDown size={12} className="text-ink-500/50" />;
  return dir === 'asc'
    ? <TrendingUp size={12} className="text-brand-500" />
    : <TrendingDown size={12} className="text-brand-500" />;
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({
  icon, title, value, subtitle, color, trend,
}: {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  subtitle?: string;
  color: string;
  trend?: { dir: 'up' | 'down'; label: string };
}) {
  const colorMap: Record<string, string> = {
    blue:   'bg-blue-50 text-blue-600',
    green:  'bg-emerald-50 text-emerald-600',
    purple: 'bg-violet-50 text-violet-600',
    orange: 'bg-orange-50 text-orange-600',
    amber:  'bg-amber-50 text-amber-600',
  };
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-card border border-slate-100 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between">
        <div className={`rounded-xl p-2.5 ${colorMap[color]}`}>{icon}</div>
        {trend && (
          <span className={`inline-flex items-center gap-1 text-xs font-bold rounded-full px-2 py-0.5 ${trend.dir === 'up' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
            {trend.dir === 'up' ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {trend.label}
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-black text-ink-900 leading-tight">{value}</p>
        <p className="mt-0.5 text-xs font-semibold text-ink-500">{title}</p>
        {subtitle && <p className="mt-1 text-xs text-ink-500/70">{subtitle}</p>}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function StockView({
  initial,
  initialLowStockOnly = false,
  highlightedProductId = null,
}: {
  initial: InventoryItem[];
  initialLowStockOnly?: boolean;
  highlightedProductId?: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();

  // ── Filter state
  const [search, setSearch]           = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(initialLowStockOnly);
  const [sortBy, setSortBy]           = useState<'name' | 'depot' | 'boutique' | 'incoming'>('name');
  const [sortDir, setSortDir]         = useState<'asc' | 'desc'>('asc');
  const [showFilters, setShowFilters] = useState(false);

  // ── Pagination
  const [page, setPage]       = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // ── Modals / drawers
  const [adjusting, setAdjusting]         = useState<InventoryItem | null>(null);
  const [adjustingLocation, setAdjustingLocation] = useState<'DEPOT' | 'BOUTIQUE'>('DEPOT');
  const [qtyDelta, setQtyDelta]           = useState('');
  const [reason, setReason]               = useState('');
  const [drawerItem, setDrawerItem]       = useState<InventoryItem | null>(null);
  const [historyFor, setHistoryFor]       = useState<InventoryItem | null>(null);
  const [movements, setMovements]         = useState<StockMovement[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [adjustBusy, setAdjustBusy]       = useState(false);

  // ── Computed KPIs ─────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total        = initial.length;
    const outOfStock   = initial.filter((i) => i.available === 0).length;
    const lowStock     = initial.filter((i) => {
      const thresh = i.lowStockThreshold ?? 5;
      return (i.available > 0 && i.available <= thresh) || (i.boutiqueAvailable > 0 && i.boutiqueAvailable <= thresh);
    }).length;
    const totalDepot   = initial.reduce((s, i) => s + i.onHand, 0);
    const totalBoutique = initial.reduce((s, i) => s + i.boutiqueOnHand, 0);
    return { total, outOfStock, lowStock, totalDepot, totalBoutique };
  }, [initial]);

  // ── Filtered + sorted data ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...initial];
    if (search) list = list.filter((i) => i.productName.toLowerCase().includes(search.toLowerCase()));
    if (lowStockOnly) {
      list = list.filter((i) => {
        const thresh = i.lowStockThreshold ?? 5;
        return i.available <= thresh || i.boutiqueAvailable <= thresh;
      });
    }
    list.sort((a, b) => {
      let va = 0, vb = 0;
      if (sortBy === 'name')     { va = a.productName.localeCompare(b.productName); return sortDir === 'asc' ? va : -va; }
      if (sortBy === 'depot')    { va = a.available; vb = b.available; }
      if (sortBy === 'boutique') { va = a.boutiqueAvailable; vb = b.boutiqueAvailable; }
      if (sortBy === 'incoming') { va = a.incomingPurchase; vb = b.incomingPurchase; }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return list;
  }, [initial, search, lowStockOnly, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated  = filtered.slice((page - 1) * pageSize, page * pageSize);

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir('asc'); }
    setPage(1);
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  async function submitAdjust() {
    if (!adjusting || !qtyDelta) { toast.error('Quantité requise'); return; }
    setAdjustBusy(true);
    try {
      const res = await fetch('/api/admin/inventory/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: adjusting.productId,
          qty: Number(qtyDelta),
          reason: reason.trim() || `Ajustement manuel (${adjustingLocation === 'BOUTIQUE' ? 'Boutique' : 'Dépôt'})`,
          locationId: adjustingLocation,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error ?? 'Erreur'); return; }
      toast.success(`Stock ${adjustingLocation === 'BOUTIQUE' ? 'Boutique' : 'Dépôt'} ajusté avec succès`);
      setAdjusting(null); setQtyDelta(''); setReason('');
      startTransition(() => router.refresh());
    } finally {
      setAdjustBusy(false);
    }
  }

  const openHistory = useCallback(async (item: InventoryItem) => {
    setHistoryFor(item);
    setLoadingHistory(true);
    try {
      const res  = await fetch(`/api/admin/inventory/movements/${item.productId}?perPage=50`);
      const data = await res.json();
      setMovements(res.ok ? data.items : []);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  function openDrawer(item: InventoryItem) {
    setDrawerItem(item);
  }

  return (
    <div className="min-h-screen bg-[#F4F6F9]">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-black text-ink-900 tracking-tight">Stock</h1>
            <p className="text-xs font-medium text-ink-500 mt-0.5">Gérez vos stocks par dépôt et par boutique</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.refresh()}
              className="btn-ghost gap-2 px-3 py-2 text-sm"
              title="Actualiser"
            >
              <RefreshCw size={14} />
            </button>
            <button className="btn-ghost gap-2 px-3 py-2 text-sm">
              <Download size={14} /> Exporter
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`btn-ghost gap-2 px-3 py-2 text-sm ${showFilters ? 'bg-brand-50 border-brand-300 text-brand-700' : ''}`}
            >
              <SlidersHorizontal size={14} /> Filtres
            </button>
            <button
              onClick={() => { if (initial.length > 0) { setAdjusting(initial[0]); setQtyDelta(''); setReason(''); } }}
              className="btn-primary gap-2 px-4 py-2 text-sm"
            >
              <Settings2 size={14} /> Ajustement
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 space-y-5">
        {/* ── KPI Cards ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard
            icon={<Boxes size={20} />}
            title="Produits totaux"
            value={kpis.total}
            subtitle="références actives"
            color="blue"
          />
          <KpiCard
            icon={<Archive size={20} />}
            title="Stock Dépôt"
            value={kpis.totalDepot}
            subtitle="unités en entrepôt"
            color="green"
          />
          <KpiCard
            icon={<Store size={20} />}
            title="Stock Boutique"
            value={kpis.totalBoutique}
            subtitle="unités en boutique"
            color="purple"
          />
          <KpiCard
            icon={<X size={20} />}
            title="Rupture de stock"
            value={kpis.outOfStock}
            subtitle="produits à zéro"
            color="orange"
            trend={kpis.outOfStock > 0 ? { dir: 'down', label: `${kpis.outOfStock} prod.` } : undefined}
          />
          <KpiCard
            icon={<AlertTriangle size={20} />}
            title="Stock faible"
            value={kpis.lowStock}
            subtitle="en dessous du seuil"
            color="amber"
            trend={kpis.lowStock > 0 ? { dir: 'down', label: 'Attention' } : undefined}
          />
        </div>

        {/* ── Filter Toolbar ───────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
              <input
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-50"
                placeholder="Rechercher un produit..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
              {search && (
                <button onClick={() => { setSearch(''); setPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-900">
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Low stock toggle */}
            <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-ink-700 hover:bg-white transition select-none">
              <div
                onClick={() => { setLowStockOnly(!lowStockOnly); setPage(1); }}
                className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${lowStockOnly ? 'bg-amber-500' : 'bg-slate-300'}`}
              >
                <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${lowStockOnly ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <span>Stock faible</span>
              {lowStockOnly && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-black text-amber-700">{kpis.lowStock}</span>}
            </label>

            {/* Sort */}
            <select
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-ink-700 outline-none hover:bg-white transition cursor-pointer"
              value={`${sortBy}_${sortDir}`}
              onChange={(e) => {
                const [col, dir] = e.target.value.split('_');
                setSortBy(col as typeof sortBy);
                setSortDir(dir as 'asc' | 'desc');
                setPage(1);
              }}
            >
              <option value="name_asc">Nom A→Z</option>
              <option value="name_desc">Nom Z→A</option>
              <option value="depot_desc">Dépôt ↑</option>
              <option value="depot_asc">Dépôt ↓</option>
              <option value="boutique_desc">Boutique ↑</option>
              <option value="boutique_asc">Boutique ↓</option>
              <option value="incoming_desc">Achats en cours</option>
            </select>

            <div className="ml-auto flex items-center gap-2 text-xs text-ink-500 font-medium">
              <span className="rounded-full bg-brand-50 px-2.5 py-1 font-bold text-brand-700">{filtered.length}</span>
              produit{filtered.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Chips showing active filters */}
          {(search || lowStockOnly) && (
            <div className="flex items-center gap-2 px-4 pb-3 border-t border-slate-100 pt-2">
              <span className="text-xs text-ink-500 font-medium">Filtres actifs :</span>
              {search && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-700">
                  "{search}" <button onClick={() => { setSearch(''); setPage(1); }}><X size={11} /></button>
                </span>
              )}
              {lowStockOnly && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                  Stock faible <button onClick={() => { setLowStockOnly(false); setPage(1); }}><X size={11} /></button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Table ────────────────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                {/* Group header */}
                <tr className="border-b border-slate-100">
                  <th className="px-4 pt-3 pb-1 text-left" rowSpan={2}>
                    <button
                      onClick={() => toggleSort('name')}
                      className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-ink-500 hover:text-ink-900 transition"
                    >
                      PRODUIT <SortIcon col="name" currentSort={sortBy} dir={sortDir} />
                    </button>
                  </th>
                  <th
                    colSpan={3}
                    className="px-4 pt-3 pb-1 text-center text-xs font-black uppercase tracking-wider"
                    style={{ color: '#162ee3' }}
                  >
                    DÉPÔT
                  </th>
                  <th
                    colSpan={2}
                    className="px-4 pt-3 pb-1 text-center text-xs font-black uppercase tracking-wider"
                    style={{ color: '#22bf59' }}
                  >
                    BOUTIQUE
                  </th>
                  <th className="px-4 pt-3 pb-1 text-center text-xs font-black uppercase tracking-wider text-ink-500" rowSpan={2}>
                    ACHATS
                  </th>
                  <th className="px-4 pt-3 pb-1 text-right text-xs font-black uppercase tracking-wider text-ink-500" rowSpan={2}>
                    ACTIONS
                  </th>
                </tr>
                {/* Sub-headers */}
                <tr className="border-b-2 border-slate-200 bg-slate-50">
                  <th className="px-4 pb-2.5 text-center text-[11px] font-bold text-ink-500">
                    <button onClick={() => toggleSort('depot')} className="flex items-center gap-1 mx-auto hover:text-ink-900 transition">
                      En stock <SortIcon col="depot" currentSort={sortBy} dir={sortDir} />
                    </button>
                  </th>
                  <th className="px-4 pb-2.5 text-center text-[11px] font-bold text-ink-500">Réservé</th>
                  <th className="px-4 pb-2.5 text-center text-[11px] font-bold text-ink-500">Disponible</th>
                  <th className="px-4 pb-2.5 text-center text-[11px] font-bold text-ink-500">
                    <button onClick={() => toggleSort('boutique')} className="flex items-center gap-1 mx-auto hover:text-ink-900 transition">
                      En stock <SortIcon col="boutique" currentSort={sortBy} dir={sortDir} />
                    </button>
                  </th>
                  <th className="px-4 pb-2.5 text-center text-[11px] font-bold text-ink-500">Disponible</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="rounded-2xl bg-slate-100 p-5">
                          <Package size={32} className="text-ink-500" />
                        </div>
                        <div>
                          <p className="font-bold text-ink-900">Aucun produit trouvé</p>
                          <p className="text-sm text-ink-500 mt-1">
                            {search ? `Aucun résultat pour "${search}"` : 'Aucun produit disponible.'}
                          </p>
                        </div>
                        {search && (
                          <button onClick={() => setSearch('')} className="btn-ghost text-sm px-4 py-2">
                            Effacer la recherche
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginated.map((item, idx) => {
                    const lowDepot    = item.lowStockThreshold != null && item.available <= item.lowStockThreshold;
                    const lowBoutique = item.lowStockThreshold != null && item.boutiqueAvailable <= item.lowStockThreshold;
                    const isHighlighted = item.productId === highlightedProductId;

                    return (
                      <tr
                        key={item.productId}
                        className={`group border-b border-slate-100 transition-colors duration-100 cursor-pointer
                          ${isHighlighted ? 'bg-brand-50 ring-2 ring-inset ring-brand-200' : 'hover:bg-slate-50/80'}`}
                        onClick={() => openDrawer(item)}
                      >
                        {/* Product cell */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {/* Thumbnail image or placeholder */}
                            <div className="h-10 w-10 flex-shrink-0 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shadow-xs">
                              {item.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={item.imageUrl} alt={item.productName} className="h-full w-full object-cover" />
                              ) : (
                                <Package size={16} className="text-ink-500" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-ink-900 truncate max-w-[220px] text-sm leading-tight">
                                {item.productName}
                              </p>
                              {item.productSlug && (
                                <p className="text-[10px] text-ink-500 font-medium mt-0.5 font-mono">
                                  #{item.productSlug.slice(0, 12)}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Dépôt: En stock */}
                        <td className="px-4 py-3 text-center">{neutralBadge(item.onHand)}</td>
                        {/* Dépôt: Réservé */}
                        <td className="px-4 py-3 text-center">{neutralBadge(item.reserved)}</td>
                        {/* Dépôt: Disponible */}
                        <td className="px-4 py-3 text-center">{stockBadge(item.available, lowDepot)}</td>
                        {/* Boutique: En stock */}
                        <td className="px-4 py-3 text-center">{neutralBadge(item.boutiqueOnHand)}</td>
                        {/* Boutique: Disponible */}
                        <td className="px-4 py-3 text-center">{stockBadge(item.boutiqueAvailable, lowBoutique)}</td>

                        {/* Incoming purchases */}
                        <td className="px-4 py-3 text-center">
                          {item.incomingPurchase > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-black text-blue-700">
                              <Truck size={11} /> +{item.incomingPurchase}
                            </span>
                          ) : (
                            <span className="text-ink-300">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                            <button
                              onClick={() => openHistory(item)}
                              className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-slate-100 hover:text-ink-900 transition"
                              title="Historique des mouvements"
                            >
                              <History size={15} />
                            </button>
                            <button
                              onClick={() => { setAdjusting(item); setQtyDelta(''); setReason(''); }}
                              className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-600 transition"
                              title="Ajuste le stock dépôt"
                            >
                              Ajuster
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ─────────────────────────────────────────────────── */}
          {filtered.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
              <div className="flex items-center gap-3 text-sm text-ink-500">
                <span>Lignes par page</span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-medium text-ink-900 outline-none"
                >
                  {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-ink-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <ChevronLeft size={15} />
                </button>
                {/* Page numbers */}
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const p = totalPages <= 7 ? i + 1 : (() => {
                    if (i === 0) return 1;
                    if (i === 6) return totalPages;
                    const start = Math.max(2, page - 2);
                    const end   = Math.min(totalPages - 1, page + 2);
                    return start + i - 1;
                  })();
                  if (typeof p !== 'number') return null;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`grid h-8 min-w-[32px] place-items-center rounded-lg border text-xs font-bold transition px-2
                        ${page === p
                          ? 'border-brand-500 bg-brand-500 text-white'
                          : 'border-slate-200 bg-white text-ink-700 hover:bg-slate-50'
                        }`}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage(page + 1)}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-ink-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <ChevronRight size={15} />
                </button>
              </div>

              <div className="text-xs text-ink-500 font-medium">
                {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} sur {filtered.length}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          PRODUCT DETAIL DRAWER
      ══════════════════════════════════════════════════════════════════════ */}
      {drawerItem && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setDrawerItem(null)}>
          <div className="flex-1 bg-slate-900/40 backdrop-blur-sm" />
          <div
            className="h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: 'slideInRight 0.22s ease-out' }}
          >
            {/* Drawer header */}
            <div className="sticky top-0 z-10 flex items-center justify-between bg-white border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 flex-shrink-0 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden">
                  {drawerItem.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={drawerItem.imageUrl} alt={drawerItem.productName} className="h-full w-full object-cover" />
                  ) : (
                    <Package size={18} className="text-brand-600" />
                  )}
                </div>
                <div>
                  <h2 className="font-black text-ink-900 leading-tight text-sm">{drawerItem.productName}</h2>
                  {drawerItem.productSlug && (
                    <p className="text-[10px] text-ink-500 font-mono">{drawerItem.productSlug}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setDrawerItem(null)}
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-slate-100 transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Stock overview cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-blue-50 p-3.5 border border-blue-100">
                  <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-1">Dépôt — En stock</p>
                  <p className="text-2xl font-black text-blue-700">{drawerItem.onHand}</p>
                  <p className="text-xs text-blue-500 mt-1">{drawerItem.reserved} réservé · {drawerItem.available} dispo</p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3.5 border border-emerald-100">
                  <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Boutique — En stock</p>
                  <p className="text-2xl font-black text-emerald-700">{drawerItem.boutiqueOnHand}</p>
                  <p className="text-xs text-emerald-500 mt-1">{drawerItem.boutiqueReserved} réservé · {drawerItem.boutiqueAvailable} dispo</p>
                </div>
              </div>

              {/* Incoming */}
              {drawerItem.incomingPurchase > 0 && (
                <div className="flex items-center gap-3 rounded-xl bg-blue-50 border border-blue-200 p-3.5">
                  <Truck size={18} className="text-blue-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-blue-900">Achat en cours</p>
                    <p className="text-xs text-blue-600">+{drawerItem.incomingPurchase} unité{drawerItem.incomingPurchase !== 1 ? 's' : ''} attendue{drawerItem.incomingPurchase !== 1 ? 's' : ''}</p>
                  </div>
                </div>
              )}

              {/* Low stock warning */}
              {drawerItem.lowStockThreshold != null && drawerItem.available <= drawerItem.lowStockThreshold && (
                <div className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 p-3.5">
                  <AlertTriangle size={18} className="text-amber-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-amber-900">Stock faible</p>
                    <p className="text-xs text-amber-600">Seuil : {drawerItem.lowStockThreshold} unités</p>
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-ink-700">
                    <Clock size={14} className="text-ink-500" />
                    Dernière mise à jour
                  </div>
                  <span className="text-xs font-medium text-ink-900">
                    {drawerItem.updatedAt ? new Date(drawerItem.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  </span>
                </div>
              </div>

              {/* Quick actions */}
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-ink-500 mb-3">Actions rapides</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { setDrawerItem(null); setAdjusting(drawerItem); setQtyDelta(''); setReason(''); }}
                    className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white hover:bg-brand-600 transition"
                  >
                    <Settings2 size={15} /> Ajuster (Dépôt)
                  </button>
                  <button
                    onClick={() => { setDrawerItem(null); openHistory(drawerItem); }}
                    className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-ink-700 hover:bg-slate-50 transition"
                  >
                    <History size={15} /> Historique
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          ADJUST MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      {adjusting && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={() => setAdjusting(null)}>
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: 'scaleIn 0.18s ease-out' }}
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="rounded-xl bg-brand-50 p-2.5">
                <Settings2 size={20} className="text-brand-600" />
              </div>
              <div>
                <h2 className="text-lg font-black text-ink-900">Ajuster le stock</h2>
                <p className="text-xs text-ink-500 truncate max-w-[220px]">{adjusting.productName}</p>
              </div>
            </div>

            {/* Location selector tabs */}
            <div className="mb-4 flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setAdjustingLocation('DEPOT')}
                className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition ${
                  adjustingLocation === 'DEPOT'
                    ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Dépôt (Principal)
              </button>
              <button
                type="button"
                onClick={() => setAdjustingLocation('BOUTIQUE')}
                className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition ${
                  adjustingLocation === 'BOUTIQUE'
                    ? 'bg-white text-emerald-700 shadow-sm border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Boutique (POS)
              </button>
            </div>

            {/* Current stock info for selected location */}
            <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3.5 border border-slate-200">
              <div className="text-center">
                <p className="text-xs text-ink-500 font-medium">En stock ({adjustingLocation === 'BOUTIQUE' ? 'Boutique' : 'Dépôt'})</p>
                <p className="text-xl font-black text-ink-900">
                  {adjustingLocation === 'BOUTIQUE' ? adjusting.boutiqueOnHand : adjusting.onHand}
                </p>
              </div>
              <div className="text-center border-l border-slate-200">
                <p className="text-xs text-ink-500 font-medium">Disponible</p>
                <p className={`text-xl font-black ${adjustingLocation === 'BOUTIQUE' ? 'text-emerald-600' : 'text-blue-600'}`}>
                  {adjustingLocation === 'BOUTIQUE' ? adjusting.boutiqueAvailable : adjusting.available}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-bold text-ink-900">
                  Quantité à ajuster (+/-)
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setQtyDelta((v) => String((parseInt(v || '0') || 0) - 1))}
                    className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl border border-slate-200 hover:bg-slate-50 transition font-bold"
                  >
                    <Minus size={16} />
                  </button>
                  <input
                    type="number"
                    className="input text-center font-bold text-lg py-2"
                    value={qtyDelta}
                    onChange={(e) => setQtyDelta(e.target.value)}
                    placeholder="0"
                  />
                  <button
                    onClick={() => setQtyDelta((v) => String((parseInt(v || '0') || 0) + 1))}
                    className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl border border-slate-200 hover:bg-slate-50 transition font-bold"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                {qtyDelta && !isNaN(Number(qtyDelta)) && (
                  <p className="mt-1.5 text-xs text-ink-500">
                    Nouveau stock {adjustingLocation === 'BOUTIQUE' ? 'Boutique' : 'Dépôt'} :{' '}
                    <strong className="text-ink-900">
                      {(adjustingLocation === 'BOUTIQUE' ? adjusting.boutiqueOnHand : adjusting.onHand) + Number(qtyDelta)}
                    </strong>
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setAdjusting(null)} className="btn-ghost px-4 py-2 text-sm">Annuler</button>
              <button
                onClick={submitAdjust}
                disabled={adjustBusy || !qtyDelta}
                className="btn-primary px-4 py-2 text-sm disabled:opacity-40"
              >
                {adjustBusy ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          HISTORY DRAWER
      ══════════════════════════════════════════════════════════════════════ */}
      {historyFor && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setHistoryFor(null)}>
          <div className="flex-1 bg-slate-900/40 backdrop-blur-sm" />
          <div
            className="h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: 'slideInRight 0.22s ease-out' }}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between bg-white border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-slate-100 p-2.5">
                  <Activity size={18} className="text-ink-700" />
                </div>
                <div>
                  <h2 className="font-black text-ink-900 text-sm">Historique des mouvements</h2>
                  <p className="text-[11px] text-ink-500 font-medium truncate max-w-[220px]">{historyFor.productName}</p>
                </div>
              </div>
              <button
                onClick={() => setHistoryFor(null)}
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-slate-100 transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5">
              {loadingHistory ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="animate-pulse rounded-xl bg-slate-100 h-16" />
                  ))}
                </div>
              ) : movements.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16">
                  <div className="rounded-2xl bg-slate-100 p-5">
                    <History size={28} className="text-ink-500" />
                  </div>
                  <p className="font-bold text-ink-700">Aucun mouvement enregistré</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {movements.map((m) => (
                    <li key={m.id} className="rounded-xl border border-slate-100 bg-slate-50 hover:bg-white transition p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`h-8 w-8 flex-shrink-0 rounded-lg flex items-center justify-center text-sm font-black
                            ${m.qty >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                            {m.qty >= 0 ? '+' : ''}{m.qty}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-ink-900 truncate">
                              {MOVEMENT_LABEL[m.type] ?? m.type}
                            </p>
                            {m.reason && <p className="text-xs text-ink-500 mt-0.5 truncate">{m.reason}</p>}
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <p className="text-[10px] text-ink-500">
                            {new Date(m.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                          </p>
                          <p className="text-[10px] text-ink-500">
                            {new Date(m.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[10px] text-ink-400 border-t border-slate-200 pt-2">
                        <span>{m.actor.name}</span>
                        <span>Stock après : <strong className="text-ink-700">{m.onHandAfter}</strong></span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Keyframe animations (injected once) */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.92); opacity: 0; }
          to   { transform: scale(1);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
