'use client';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Boxes,
  CircleDollarSign,
  Edit,
  Eye,
  GripVertical,
  Package,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import ProductDrawer from './ProductDrawer';
import { useToast } from './Toast';
import { formatPrice } from '@/lib/site-config';
import type { Product } from '@/types';
import type { DashboardStats } from '@/types/dashboard';

type Props = {
  initialProducts: Product[];
  totals: {
    products: number;
  };
  initialEditingId?: string | null;
};

type RevenueState = {
  value: number | null;
  orders: number | null;
  loading: boolean;
  error: boolean;
};

export default function ProduitsView({ initialProducts, totals, initialEditingId = null }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [drawerOpen, setDrawerOpen] = useState(Boolean(initialEditingId));
  const [editingId, setEditingId] = useState<string | null>(initialEditingId);
  const [products, setProducts] = useState(initialProducts);
  useEffect(() => { setProducts(initialProducts); }, [initialProducts]);
  const [revenue, setRevenue] = useState<RevenueState>({
    value: null,
    orders: null,
    loading: true,
    error: false,
  });

  const loadRevenue = useCallback(async () => {
    setRevenue((current) => ({ ...current, loading: true, error: false }));
    try {
      const response = await fetch('/api/admin/stats/dashboard?days=30', { cache: 'no-store' });
      if (!response.ok) throw new Error('stats unavailable');
      const stats = await response.json() as DashboardStats;
      setRevenue({
        value: stats.period.revenue,
        orders: stats.period.orders,
        loading: false,
        error: false,
      });
    } catch {
      setRevenue({ value: null, orders: null, loading: false, error: true });
    }
  }, []);

  useEffect(() => { void loadRevenue(); }, [loadRevenue]);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragEnabled = !query.trim() && !statusFilter;

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (statusFilter && p.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        p.id,
        p.name,
        p.slug,
        ...(p.categorySlugs ?? []),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [products, query, statusFilter]);

  function openCreate() { setEditingId(null); setDrawerOpen(true); }
  function openEdit(id: string) { setEditingId(id); setDrawerOpen(true); }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(filteredProducts.map((p) => p.id)) : new Set());
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Supprimer « ${name} » ? Le produit sera mis à la corbeille.`)) return;
    const snapshot = products;
    setProducts((prev) => prev.filter((p) => p.id !== id));
    const res = await fetch(`/api/admin/products/${id}`, { method: 'DELETE' });
    if (!res.ok) { setProducts(snapshot); toast.error('Erreur de suppression'); return; }
    toast.success(`« ${name} » supprimé`);
    startTransition(() => router.refresh());
  }

  async function bulkDelete() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`Supprimer ${ids.length} produit${ids.length > 1 ? 's' : ''} ?`)) return;
    const snapshot = products;
    setProducts((prev) => prev.filter((p) => !selected.has(p.id)));
    setSelected(new Set());

    const results = await Promise.allSettled(
      ids.map((id) => fetch(`/api/admin/products/${id}`, { method: 'DELETE' }).then((r) => (r.ok ? id : Promise.reject(id)))),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - ok;
    if (ok) toast.success(`${ok} produit${ok > 1 ? 's' : ''} supprimé${ok > 1 ? 's' : ''}`);
    if (failed) {
      toast.error(`${failed} échec${failed > 1 ? 's' : ''}`);
      setProducts(snapshot);
    }
    startTransition(() => router.refresh());
  }

  function applySavedProduct(p: Product) {
    setProducts((prev) => {
      const idx = prev.findIndex((x) => x.id === p.id);
      if (idx >= 0) { const next = prev.slice(); next[idx] = p; return next; }
      return [p, ...prev];
    });
    toast.success(`« ${p.name} » enregistré`);
    startTransition(() => router.refresh());
  }

  const allChecked = filteredProducts.length > 0 && filteredProducts.every((p) => selected.has(p.id));
  const someChecked = filteredProducts.some((p) => selected.has(p.id)) && !allChecked;

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8">
      <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-brand-600">
            <Package size={15} aria-hidden="true" />
            Catalogue
          </div>
          <h1 className="text-3xl font-black tracking-tight text-ink-950 sm:text-4xl">Gestion des produits</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-700 sm:text-base">
            Pilotez vos prix, votre disponibilité et la présentation du catalogue depuis un seul espace.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="btn-primary inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 px-5 shadow-[0_14px_30px_-16px_rgba(16,29,160,0.65)]"
        >
          <Plus size={18} aria-hidden="true" /> Ajouter un produit
        </button>
      </header>

      <section className="mb-7 grid gap-4 sm:grid-cols-2" aria-label="Indicateurs du catalogue">
        <div className="card flex min-h-32 items-center gap-4 p-5">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
            <Boxes size={22} aria-hidden="true" />
          </div>
          <div>
            <p className="text-3xl font-black tabular-nums text-ink-950">{totals.products}</p>
            <p className="mt-1 text-sm font-semibold text-ink-700">Produits au catalogue</p>
          </div>
        </div>
        <div className="relative min-h-32 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-brand-800 to-slate-950 p-5 text-white shadow-[0_20px_45px_-24px_rgba(16,29,160,0.7)]">
          <div className="absolute -right-10 -top-12 h-32 w-32 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
          <div className="relative flex h-full items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-brand-100">Chiffre d’affaires · 30 jours</p>
              {revenue.loading ? (
                <div className="mt-3 h-9 w-36 rounded-lg bg-white/15 motion-safe:animate-pulse" aria-label="Chargement du chiffre d’affaires" />
              ) : revenue.error ? (
                <div className="mt-3">
                  <p className="text-sm font-semibold text-red-100">Données indisponibles</p>
                  <button
                    type="button"
                    onClick={() => void loadRevenue()}
                    className="mt-2 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-white/10 px-3 text-xs font-bold text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <RefreshCw size={14} aria-hidden="true" /> Réessayer
                  </button>
                </div>
              ) : (
                <>
                  <p className="mt-2 text-3xl font-black tabular-nums tracking-tight">{formatPrice(revenue.value ?? 0)}</p>
                  <p className="mt-1 text-xs text-blue-100/75">
                    {revenue.orders ?? 0} commande{revenue.orders === 1 ? '' : 's'} · confirmées uniquement
                  </p>
                </>
              )}
            </div>
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-brand-100 ring-1 ring-white/15">
              <CircleDollarSign size={22} aria-hidden="true" />
            </div>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <section className="card overflow-hidden" aria-label="Liste des produits">
      <div className="flex flex-col gap-4 border-b border-ink-200 p-4 sm:p-5 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1 lg:max-w-lg">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-700" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher (ID, nom, slug, catégorie)…"
            className="input min-h-12 pl-10 pr-11"
            aria-label="Rechercher dans les produits"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 cursor-pointer place-items-center rounded-xl text-ink-700 transition hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-label="Effacer"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input min-h-12 w-full cursor-pointer lg:w-52"
          aria-label="Filtrer par statut"
        >
          <option value="">Tous les statuts</option>
          <option value="published">Affiché</option>
          <option value="draft">Brouillon</option>
          <option value="private">Privé</option>
        </select>
        {(query || statusFilter) && (
          <button onClick={() => { setQuery(''); setStatusFilter(''); }} className="btn-ghost min-h-12 cursor-pointer">
            Réinitialiser
          </button>
        )}
        <div className="flex flex-wrap items-center gap-3 lg:ml-auto">
          <span className="text-sm font-semibold tabular-nums text-ink-700">
            {filteredProducts.length} résultat{filteredProducts.length === 1 ? '' : 's'}
          </span>
          {selected.size > 0 && (
            <>
              <span className="text-sm font-bold text-ink-900">{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</span>
              <button
                onClick={bulkDelete}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-soft transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
              >
                <Trash2 size={14} /> Supprimer la sélection
              </button>
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-ink-100/80 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-700">
            <tr>
              {dragEnabled && <th className="w-8 px-2 py-3"></th>}
              <th className="w-10 px-4 py-3">
                <label className="grid h-11 w-11 cursor-pointer place-items-center rounded-lg hover:bg-white">
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-brand-500"
                    checked={allChecked}
                    ref={(el) => { if (el) el.indeterminate = someChecked; }}
                    onChange={(e) => toggleAll(e.target.checked)}
                    aria-label="Tout sélectionner"
                  />
                </label>
              </th>
              <th className="px-4 py-3 text-left">Produit</th>
              <th className="px-4 py-3 text-left">Prix actuel</th>
              <th className="px-4 py-3 text-left">Statut</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((p, index) => {
              const isSelected = selected.has(p.id);
              const tone =
                p.status === 'published' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' :
                p.status === 'draft' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' :
                'bg-slate-100 text-slate-700 ring-1 ring-slate-200';
              return (
                <tr
                  key={p.id}
                  draggable={dragEnabled}
                  onDragStart={(e) => {
                    setDraggedIndex(index);
                    e.dataTransfer.setData('text/plain', index.toString());
                  }}
                  onDragEnd={() => {
                    setDraggedIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragOver={(e) => {
                    if (dragEnabled) e.preventDefault();
                  }}
                  onDragEnter={() => {
                    if (dragEnabled && draggedIndex !== null) {
                      setDragOverIndex(index);
                    }
                  }}
                  onDrop={async (e) => {
                    if (!dragEnabled || draggedIndex === null) return;
                    const sourceIndex = draggedIndex;
                    const targetIndex = index;
                    if (sourceIndex === targetIndex) return;

                    const reordered = [...products];
                    const [removed] = reordered.splice(sourceIndex, 1);
                    reordered.splice(targetIndex, 0, removed);
                    
                    setProducts(reordered);
                    setDraggedIndex(null);
                    setDragOverIndex(null);

                    const updates = reordered.map((prod, i) => ({ id: prod.id, menuOrder: i }));
                    try {
                      const res = await fetch('/api/admin/products', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ items: updates }),
                      });
                      if (!res.ok) throw new Error();
                      toast.success('Ordre des produits mis à jour');
                    } catch {
                      toast.error("Erreur lors de la mise à jour de l'ordre");
                      startTransition(() => router.refresh());
                    }
                  }}
                  className={`border-t border-ink-200 transition-colors duration-200 ${isSelected ? 'bg-brand-50/60' : 'hover:bg-ink-100/70'} ${pending ? 'opacity-60' : ''} ${draggedIndex === index ? 'bg-brand-50 opacity-40' : ''} ${dragOverIndex === index && draggedIndex !== index ? 'border-t-2 border-t-brand-500' : ''}`}
                >
                  {dragEnabled && (
                    <td className="cursor-grab px-2 py-3 text-ink-500 hover:text-ink-950 active:cursor-grabbing drag-handle" title="Glisser pour réordonner">
                      <GripVertical size={18} aria-hidden="true" />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <label className="grid h-11 w-11 cursor-pointer place-items-center rounded-lg hover:bg-white">
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-brand-500"
                        checked={isSelected}
                        onChange={() => toggleOne(p.id)}
                        aria-label={`Sélectionner ${p.name}`}
                      />
                    </label>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {p.images[0]?.url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- MinIO/WP URLs; avoids next/image optimizer cache on stale broken URLs
                        <img src={p.images[0].url} alt={p.name} width={52} height={64} loading="lazy" className="h-16 w-[52px] rounded-xl border border-ink-200 bg-white object-cover" />
                      ) : (
                        <div className="grid h-16 w-[52px] place-items-center rounded-xl border border-dashed border-ink-300 bg-ink-100 text-ink-500">
                          <Package size={19} aria-hidden="true" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="max-w-sm truncate font-bold text-ink-950" title={p.name}>{p.name}</p>
                        <p className="mt-1 max-w-sm truncate text-xs text-ink-500">{p.slug}</p>
                        <p className="mt-1 font-mono text-[10px] text-ink-500">ID {p.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-black tabular-nums text-ink-950">{formatPrice(p.price)}</p>
                    {p.onSale && p.regularPrice > p.price && (
                      <p className="mt-1 text-xs tabular-nums text-ink-500 line-through">{formatPrice(p.regularPrice)}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${tone}`}>
                      {p.status === 'published' ? 'Affiché' : p.status === 'draft' ? 'Brouillon' : 'Privé'}
                    </span>
                    {p.posOnly && (
                      <span
                        className="ml-1.5 inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200"
                        title="N'apparaît pas sur le site web — vendu uniquement en caisse"
                      >
                        POS uniquement
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <a
                        href={`/produit/${p.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="grid h-11 w-11 cursor-pointer place-items-center rounded-xl text-ink-600 transition hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                        aria-label={`Voir ${p.name} dans la boutique`}
                        title="Voir dans la boutique"
                      ><Eye size={17} aria-hidden="true" /></a>
                      <button type="button" onClick={() => openEdit(p.id)} className="grid h-11 w-11 cursor-pointer place-items-center rounded-xl text-ink-600 transition hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={`Modifier ${p.name}`} title="Modifier"><Edit size={17} aria-hidden="true" /></button>
                      <button type="button" onClick={() => remove(p.id, p.name)} className="grid h-11 w-11 cursor-pointer place-items-center rounded-xl text-red-600 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300" aria-label={`Supprimer ${p.name}`} title="Supprimer"><Trash2 size={17} aria-hidden="true" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!filteredProducts.length && (
              <tr>
                <td colSpan={dragEnabled ? 8 : 7} className="p-12 text-center text-ink-700">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-ink-100 text-ink-500">
                    <Search size={22} aria-hidden="true" />
                  </div>
                  <p className="mt-4 font-bold text-ink-950">{products.length === 0 ? 'Votre catalogue est vide' : 'Aucun produit trouvé'}</p>
                  <p className="mt-1 text-sm">{products.length === 0 ? 'Ajoutez votre premier produit pour commencer.' : 'Modifiez votre recherche ou réinitialisez les filtres.'}</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </section>

      <ProductDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        productId={editingId}
        onSaved={applySavedProduct}
      />
    </div>
  );
}
