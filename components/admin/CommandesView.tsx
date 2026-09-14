'use client';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, Edit, Trash2, Plus, Search, X, ShoppingBag } from 'lucide-react';
import OrderDrawer from './OrderDrawer';
import CustomerBadge from './CustomerBadge';
import { useToast } from './Toast';
import { formatPrice, formatDate, formatDateTime } from '@/lib/site-config';
import { adminLoginHref } from '@/lib/admin-nav';
import { getOrderStatusLabel, getOrderStatusTone, isAttemptStatus, NORMAL_STATUSES, TENTATIVE_STATUSES } from '@/lib/order-status';
import type { OrderResponse, OrderStatusCounts } from '@/types';

const EMPTY_COUNTS: OrderStatusCounts = {
  total: 0, pending: 0, confirmed: 0,
  attempts: { total: 0, attempt1: 0, attempt2: 0, attempt3: 0, attempt4: 0, attempt5: 0 },
  cancelled: 0, abandoned: 0, trash: 0,
};

/** Fixed set for the "Normal" tab's status filter — no longer derived from
 *  whichever statuses happen to be on the currently loaded page (that was
 *  a real source of the "counts don't mean what you think" confusion this
 *  view used to have). 'tentative' here is a UI-only sentinel meaning "any
 *  of tentative-1..5", expanded server-side — see app/admin/commandes/page.tsx. */
const NORMAL_STATUS_FILTERS = ['en-attente', 'confirme', 'tentative', 'annule'];

type Props = {
  initialOrders: OrderResponse[];
  total: number;
  totalPages?: number;
  page?: number;
  repeatCounts?: Record<string, number>;
  /** Real backend aggregation (OrdersService.counts()) — one number per
   *  status bucket, always reflecting the full database (scoped to the
   *  active search/date filter), never just the currently loaded page. */
  counts?: OrderStatusCounts;
  /** Employees get this exact same view (full list + pagination, not the
   *  separate MyCommandesView) pointed at the employee-scoped proxy routes —
   *  full parity with admin: view, create, edit, delete, all of it. */
  apiBase?: '/api/admin' | '/api/employee';
  /** Product ID currently active in the filter (from URL param). */
  initialProductId?: string;
};

export default function CommandesView({ initialOrders, total, totalPages = 1, page = 1, repeatCounts = {}, counts = EMPTY_COUNTS, apiBase = '/api/admin', initialProductId = '' }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const qParam = searchParams.get('q') || '';
  const statusParam = searchParams.get('status') || '';
  const tabParam = (searchParams.get('tab') || 'normal') as 'normal' | 'abandoned' | 'trash';
  const datePresetParam = searchParams.get('datePreset') || '';
  const startDateParam = searchParams.get('startDate') || '';
  const endDateParam = searchParams.get('endDate') || '';
  const sortOrderParam = searchParams.get('sortOrder') || 'desc';
  const productParam = searchParams.get('product') || '';
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [orders, setOrders] = useState(initialOrders);
  useEffect(() => { setOrders(initialOrders); }, [initialOrders]);

  // Filters
  const [activeTab, setActiveTab] = useState<'normal' | 'abandoned' | 'trash'>(tabParam);
  const [query, setQuery] = useState(qParam);
  const [statusFilter, setStatusFilter] = useState(statusParam);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(sortOrderParam === 'asc' ? 'asc' : 'desc');
  const [datePreset, setDatePreset] = useState(datePresetParam);
  const [startDate, setStartDate] = useState(startDateParam);
  const [endDate, setEndDate] = useState(endDateParam);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Sync state with URL params
  useEffect(() => { setActiveTab(tabParam); }, [tabParam]);
  useEffect(() => { setQuery(qParam); }, [qParam]);
  useEffect(() => { setStatusFilter(statusParam); }, [statusParam]);
  useEffect(() => { setSortOrder(sortOrderParam === 'asc' ? 'asc' : 'desc'); }, [sortOrderParam]);
  useEffect(() => { setDatePreset(datePresetParam); }, [datePresetParam]);
  useEffect(() => { setStartDate(startDateParam); }, [startDateParam]);
  useEffect(() => { setEndDate(endDateParam); }, [endDateParam]);

  const updateFilters = useCallback((newParams: Record<string, string | null>) => {
    const params = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(newParams)) {
      if (v === null || v === '') {
        params.delete(k);
      } else {
        params.set(k, v);
      }
    }
    if (!('page' in newParams)) {
      params.delete('page');
    }
    router.push(`?${params.toString()}`);
  }, [router]);

  // Debounce search query updates to URL
  useEffect(() => {
    const timer = setTimeout(() => {
      const currentQ = searchParams.get('q') || '';
      if (query !== currentQ) {
        updateFilters({ q: query || null });
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [query, searchParams, updateFilters]);

  const handleTabChange = (tab: 'normal' | 'abandoned' | 'trash') => {
    updateFilters({ tab, status: null });
  };

  const handleStatusChange = (status: string) => {
    updateFilters({ status });
  };

  const handleDatePresetChange = (preset: string) => {
    if (preset !== 'custom') {
      updateFilters({ datePreset: preset || null, startDate: null, endDate: null });
    } else {
      updateFilters({ datePreset: preset });
    }
  };

  const handleStartDateChange = (date: string) => {
    updateFilters({ startDate: date || null });
  };

  const handleEndDateChange = (date: string) => {
    updateFilters({ endDate: date || null });
  };

  const getPageUrl = (p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(p));
    return `?${params.toString()}`;
  };

  // Fetch online-only products for the Orders filter dropdown.
  // Uses the dedicated /orders-filter-picker endpoint which excludes posOnly
  // products at the DB level — never shows POS-only items here.
  const [allProducts, setAllProducts] = useState<{ id: string; name: string; sku: string | null }[]>([]);
  useEffect(() => {
    fetch(`${apiBase}/orders-filter-picker`)
      .then((r) => r.ok ? r.json() : [])
      .then((d) => Array.isArray(d) && setAllProducts(d))
      .catch(() => {});
  }, [apiBase]);

  // Tab counts (Normal/Abandonnées/Supprimées) and the per-status breakdown
  // both come straight from the backend aggregation prop — never recomputed
  // from `orders` (that's only ever the current page's rows, which is
  // exactly the mismatch that made the header and the filter counts look
  // inconsistent with each other before).
  const tabCounts = useMemo(() => ({
    normal: counts.total,
    abandoned: counts.abandoned,
    trash: counts.trash,
  }), [counts.total, counts.abandoned, counts.trash]);

  // The one-level "Tentative" bucket in the main filter maps to the sum of
  // all 5 attempts; the nested filter (see the JSX below) breaks it down.
  const statusFilterCounts: Record<string, number> = useMemo(() => ({
    'en-attente': counts.pending,
    confirme: counts.confirmed,
    tentative: counts.attempts.total,
    'tentative-1': counts.attempts.attempt1,
    'tentative-2': counts.attempts.attempt2,
    'tentative-3': counts.attempts.attempt3,
    'tentative-4': counts.attempts.attempt4,
    'tentative-5': counts.attempts.attempt5,
    annule: counts.cancelled,
  }), [
    counts.pending,
    counts.confirmed,
    counts.attempts.total,
    counts.attempts.attempt1,
    counts.attempts.attempt2,
    counts.attempts.attempt3,
    counts.attempts.attempt4,
    counts.attempts.attempt5,
    counts.cancelled,
  ]);

  // Product filter dropdown: product name displayed, ID stored in URL.
  // This is intentionally separate from the OrderDrawer's products-picker
  // (which includes POS-only for in-store edits).
  const handleProductChange = (productId: string) => {
    updateFilters({ product: productId || null });
  };

  // The current product filter value comes from the URL param, not local state,
  // so it survives page reloads and is always in sync with the backend query.
  const activeProductId = productParam || initialProductId;

  // The main status selector shown when the sentinel 'tentative' is picked —
  // narrows to one specific attempt, or stays on every attempt.
  const isTentativeFilterActive = statusFilter === 'tentative' || isAttemptStatus(statusFilter);

  // Active filter detection: switches between Case A (numbered pagination) and Case B (continuous view)
  const isFilterActive = Boolean(
    statusFilter ||
    activeProductId ||
    datePreset ||
    query.trim() ||
    activeTab !== 'normal'
  );

  // Map product counts from backend aggregation prop
  const productCountMap = useMemo(() => {
    const map = new Map<string, number>();
    if (counts?.products) {
      for (const p of counts.products) {
        map.set(p.productId, p.orderCount);
      }
    }
    return map;
  }, [counts?.products]);

  // Current scope total for "Tous les produits"
  const scopeTotal = useMemo(() => {
    if (activeTab === 'trash') return tabCounts.trash;
    if (activeTab === 'abandoned') return tabCounts.abandoned;
    if (statusFilter && statusFilterCounts[statusFilter] !== undefined) {
      return statusFilterCounts[statusFilter];
    }
    return tabCounts.normal;
  }, [activeTab, statusFilter, statusFilterCounts, tabCounts]);

  // Sort products for dropdown: products with matching order count first (descending), then 0-count products alphabetically
  const sortedProducts = useMemo(() => {
    return [...allProducts].sort((a, b) => {
      const countA = productCountMap.get(a.id) ?? 0;
      const countB = productCountMap.get(b.id) ?? 0;
      if (countA !== countB) return countB - countA;
      return a.name.localeCompare(b.name, 'fr');
    });
  }, [allProducts, productCountMap]);

  const formatCount = (n: number) => (n ?? 0).toLocaleString('fr-FR');

  // Background / infinite chunk loading for Case B
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialOrders.length < total);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setHasMore(orders.length < total);
  }, [orders.length, total]);

  const loadNextChunk = async () => {
    if (loadingMore || !hasMore || !isFilterActive) return;
    setLoadingMore(true);
    try {
      const nextPage = Math.floor(orders.length / 100) + 1;
      const params = new URLSearchParams();
      params.set('page', String(nextPage));
      params.set('perPage', '100');
      if (query.trim()) params.set('q', query.trim());
      if (activeProductId) params.set('productId', activeProductId);
      if (statusFilter) {
        params.set('status', statusFilter === 'tentative' ? TENTATIVE_STATUSES.join(',') : statusFilter);
      } else if (activeTab === 'normal') {
        params.set('status', NORMAL_STATUSES.join(','));
      } else if (activeTab === 'trash') {
        params.set('status', 'trash');
      } else if (activeTab === 'abandoned') {
        params.set('status', 'checkout-draft');
      }

      if (datePreset) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (datePreset === 'today') {
          params.set('after', today.toISOString());
        } else if (datePreset === 'yesterday') {
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          params.set('after', yesterday.toISOString());
          params.set('before', today.toISOString());
        } else if (datePreset === '7days') {
          const sevenDaysAgo = new Date(today);
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          params.set('after', sevenDaysAgo.toISOString());
        } else if (datePreset === 'month') {
          const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
          params.set('after', firstOfMonth.toISOString());
        } else if (datePreset === 'custom') {
          if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            params.set('after', start.toISOString());
          }
          if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            params.set('before', end.toISOString());
          }
        }
      }

      if (sortOrder) params.set('sortOrder', sortOrder);

      const res = await fetch(`${apiBase}/orders?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const newItems: OrderResponse[] = data.items || [];
        if (newItems.length > 0) {
          setOrders((prev) => {
            const existingIds = new Set(prev.map((o) => o.id));
            const uniqueNew = newItems.filter((o) => !existingIds.has(o.id));
            const merged = [...prev, ...uniqueNew];
            if (merged.length >= (data.total || total) || newItems.length < 100) {
              setHasMore(false);
            }
            return merged;
          });
        } else {
          setHasMore(false);
        }
      } else {
        setHasMore(false);
      }
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  const loadNextChunkRef = useRef(loadNextChunk);
  loadNextChunkRef.current = loadNextChunk;

  useEffect(() => {
    if (!isFilterActive || !hasMore || loadingMore) return;
    const el = sentinelRef.current;
    if (!el) return;

    const scrollContainer = el.closest('main');

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadNextChunkRef.current();
        }
      },
      { root: scrollContainer, rootMargin: '400px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [isFilterActive, hasMore, loadingMore, orders.length]);

  const activeFilterParts = useMemo(() => {
    const parts: string[] = [];
    if (activeTab !== 'normal') {
      parts.push(activeTab === 'abandoned' ? 'Abandonnées' : 'Supprimées');
    }
    if (statusFilter) {
      if (statusFilter === 'tentative') {
        parts.push('Tentative (Toutes)');
      } else {
        parts.push(getOrderStatusLabel(statusFilter));
      }
    }
    if (activeProductId) {
      const matchedProd = allProducts.find((p) => p.id === activeProductId);
      parts.push(matchedProd ? matchedProd.name : `Produit: ${activeProductId}`);
    }
    if (datePreset) {
      const dateMap: Record<string, string> = {
        today: "Aujourd'hui",
        yesterday: 'Hier',
        '7days': '7 derniers jours',
        month: 'Ce mois',
        custom: `Du ${startDate || '...'} au ${endDate || '...'}`,
      };
      parts.push(dateMap[datePreset] || datePreset);
    }
    if (query.trim()) {
      parts.push(`"${query.trim()}"`);
    }
    return parts;
  }, [statusFilter, activeProductId, allProducts, datePreset, startDate, endDate, query, activeTab]);

  const handleReset = () => {
    setQuery('');
    setStatusFilter('');
    setDatePreset('');
    setStartDate('');
    setEndDate('');
    setSortOrder('desc');
    updateFilters({
      q: null,
      status: null,
      product: null,
      datePreset: null,
      startDate: null,
      endDate: null,
      sortOrder: null,
      page: '1',
    });
  };

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
    setSelected(checked ? new Set(orders.map((o) => o.id)) : new Set());
  }

  async function remove(id: string) {
    const orderObj = orders.find((o) => o.id === id);
    const inTrash = orderObj?.status === 'trash';
    const msg = inTrash 
      ? `Supprimer définitivement la commande #${id} ? Cette action est irréversible.`
      : `Mettre la commande #${id} à la corbeille ?`;
    if (!confirm(msg)) return;
    const snapshot = orders;
    setOrders((prev) => prev.filter((o) => o.id !== id));
    const res = await fetch(`${apiBase}/orders/${id}`, { method: 'DELETE' });
    if (res.status === 401) {
      setOrders(snapshot);
      window.location.href = adminLoginHref(`from=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    if (!res.ok) {
      setOrders(snapshot);
      toast.error('Erreur de suppression');
      return;
    }
    toast.success(inTrash ? `Commande #${id} supprimée définitivement` : `Commande #${id} mise à la corbeille`);
    startTransition(() => router.refresh());
  }

  async function bulkDelete() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`Supprimer ${ids.length} commande${ids.length > 1 ? 's' : ''} ?`)) return;
    const snapshot = orders;
    setOrders((prev) => prev.filter((o) => !selected.has(o.id)));
    setSelected(new Set());

    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`${apiBase}/orders/${id}`, { method: 'DELETE' }).then((r) => {
          if (r.status === 401) throw new Error('unauthorized');
          if (!r.ok) throw new Error('failed');
          return id;
        }),
      ),
    );
    if (results.some((r) => r.status === 'rejected' && r.reason instanceof Error && r.reason.message === 'unauthorized')) {
      setOrders(snapshot);
      window.location.href = adminLoginHref(`from=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - ok;
    if (ok) toast.success(`${ok} commande${ok > 1 ? 's' : ''} supprimée${ok > 1 ? 's' : ''}`);
    if (failed) {
      toast.error(`${failed} échec${failed > 1 ? 's' : ''}`);
      setOrders(snapshot);
    }
    startTransition(() => router.refresh());
  }

  function applySavedOrder(o: OrderResponse) {
    setOrders((prev) => {
      const idx = prev.findIndex((x) => x.id === o.id);
      if (idx >= 0) { const next = prev.slice(); next[idx] = o; return next; }
      return [o, ...prev];
    });
    const navexStatus = o.meta?._navex_status as string | undefined;
    const navexTracking = o.meta?._navex_tracking as string | undefined;
    const navexError = o.meta?._navex_error as string | undefined;
    if (navexStatus === 'sent' && navexTracking) {
      toast.success(`Commande #${o.number} enregistrée · Navex ✓ ${navexTracking}`);
    } else if (navexStatus === 'failed') {
      toast.error(`Commande #${o.number} enregistrée, mais Navex a échoué : ${navexError ?? 'erreur'}`);
    } else {
      toast.success(`Commande #${o.number} enregistrée`);
    }
    startTransition(() => router.refresh());
  }

  const allChecked = orders.length > 0 && orders.every((o) => selected.has(o.id));
  const someChecked = orders.some((o) => selected.has(o.id)) && !allChecked;

  return (
    <div className="p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-soft">
            <ShoppingBag size={22} aria-hidden="true" />
          </div>
          <div>
            {isFilterActive ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-3xl font-black tracking-tight text-ink-900">
                    {activeFilterParts.length > 0 ? activeFilterParts.join(' + ') : 'Commandes filtrées'}
                  </h1>
                  <span className="rounded-full bg-brand-100 px-3 py-0.5 text-xs font-bold text-brand-700">
                    Filtre actif
                  </span>
                </div>
                <p className="text-sm font-semibold text-ink-600 mt-1">
                  <span className="text-ink-900 font-bold text-base">{formatCount(total)}</span> commande{total > 1 ? 's' : ''}
                </p>
              </>
            ) : (
              <>
                <h1 className="text-3xl font-black tracking-tight text-ink-900">Commandes</h1>
                <p className="text-sm font-semibold text-ink-500">
                  {activeTab === 'normal'
                    ? `${formatCount(tabCounts.normal)} commande${tabCounts.normal > 1 ? 's' : ''}`
                    : activeTab === 'abandoned'
                    ? `${formatCount(tabCounts.abandoned)} commande${tabCounts.abandoned > 1 ? 's' : ''} abandonnée${tabCounts.abandoned > 1 ? 's' : ''}`
                    : `${formatCount(tabCounts.trash)} commande${tabCounts.trash > 1 ? 's' : ''} supprimée${tabCounts.trash > 1 ? 's' : ''}`}
                </p>
                {activeTab === 'normal' && (
                  <p className="mt-0.5 text-xs text-ink-400">
                    = En attente ({formatCount(counts.pending)}) + Confirmée ({formatCount(counts.confirmed)}) + Tentative ({formatCount(counts.attempts.total)}) + Annulée ({formatCount(counts.cancelled)})
                  </p>
                )}
              </>
            )}
          </div>
        </div>
        <button onClick={openCreate} className="btn-primary inline-flex min-h-11 items-center gap-2">
          <Plus size={16} /> Ajouter une commande
        </button>
      </header>

      {/* Segregated tabs for normal orders, abandoned recovery checkouts, and trashed orders */}
      <div className="mb-6 inline-flex w-full flex-wrap gap-1 rounded-2xl border border-ink-200 bg-white p-1 shadow-sm sm:w-auto">
        <button
          onClick={() => handleTabChange('normal')}
          aria-pressed={activeTab === 'normal'}
          className={`min-h-11 flex-1 cursor-pointer rounded-xl px-5 text-sm font-bold transition sm:flex-none ${
            activeTab === 'normal' ? 'bg-brand-500 text-white shadow-soft' : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900'
          }`}
        >
          Normal <span className="tabular-nums opacity-80">({tabCounts.normal})</span>
        </button>
        <button
          onClick={() => handleTabChange('abandoned')}
          aria-pressed={activeTab === 'abandoned'}
          className={`min-h-11 flex-1 cursor-pointer rounded-xl px-5 text-sm font-bold transition sm:flex-none ${
            activeTab === 'abandoned' ? 'bg-indigo-500 text-white shadow-soft' : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900'
          }`}
        >
          Abandonnées <span className="tabular-nums opacity-80">({tabCounts.abandoned})</span>
        </button>
        <button
          onClick={() => handleTabChange('trash')}
          aria-pressed={activeTab === 'trash'}
          className={`min-h-11 flex-1 cursor-pointer rounded-xl px-5 text-sm font-bold transition sm:flex-none ${
            activeTab === 'trash' ? 'bg-rose-500 text-white shadow-soft' : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900'
          }`}
        >
          Supprimées <span className="tabular-nums opacity-80">({tabCounts.trash})</span>
        </button>
      </div>

      {/* Toolbar — search + status filter + product filter + date period + bulk delete */}
      <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-700" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher (numéro, client, téléphone)…"
            className="input pl-9"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-700 hover:bg-ink-100"
              aria-label="Effacer"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {activeTab === 'normal' && (
          <>
            <select
              value={isTentativeFilterActive ? 'tentative' : statusFilter}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="input w-48"
            >
              <option value="">Toutes ({formatCount(tabCounts.normal)})</option>
              {NORMAL_STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>
                  {getOrderStatusLabel(s)} ({formatCount(statusFilterCounts[s] ?? 0)})
                </option>
              ))}
            </select>
            {/* Nested attempt filter — only meaningful once "Tentative" is the
                active bucket; picking a specific one narrows further, picking
                "Toutes les tentatives" goes back to every attempt. */}
            {isTentativeFilterActive && (
              <select
                value={isAttemptStatus(statusFilter) ? statusFilter : ''}
                onChange={(e) => handleStatusChange(e.target.value || 'tentative')}
                className="input w-52"
              >
                <option value="">Toutes les tentatives ({formatCount(statusFilterCounts.tentative ?? 0)})</option>
                {TENTATIVE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {getOrderStatusLabel(s)} ({formatCount(statusFilterCounts[s] ?? 0)})
                  </option>
                ))}
              </select>
            )}
            {statusFilter === 'confirme' && (
              <select
                value={sortOrder}
                onChange={(e) => updateFilters({ sortOrder: e.target.value === 'asc' ? 'asc' : null })}
                className="input w-52 text-xs font-bold text-ink-900 border-emerald-300 bg-emerald-50/50"
                aria-label="Trier par date de confirmation"
              >
                <option value="desc">Plus récentes confirmées</option>
                <option value="asc">Plus anciennes confirmées</option>
              </select>
            )}
          </>
        )}

        <select
          value={activeProductId}
          onChange={(e) => handleProductChange(e.target.value)}
          className="input w-52 font-medium"
          disabled={pending}
          aria-label="Filtrer par produit"
        >
          <option value="">Tous les produits ({formatCount(scopeTotal)})</option>
          {sortedProducts.map((p) => {
            const count = productCountMap.get(p.id) ?? 0;
            return (
              <option key={p.id} value={p.id}>
                {p.name}{p.sku ? ` — ${p.sku}` : ''} ({formatCount(count)})
              </option>
            );
          })}
        </select>

        <select
          value={datePreset}
          onChange={(e) => handleDatePresetChange(e.target.value)}
          className="input w-44"
        >
          <option value="">Toute la période</option>
          <option value="today">Aujourd&apos;hui</option>
          <option value="yesterday">Hier</option>
          <option value="7days">7 derniers jours</option>
          <option value="month">Ce mois</option>
          <option value="custom">Personnalisé</option>
        </select>

        {datePreset === 'custom' && (
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={startDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
              className="input w-36 py-2 px-3 text-xs"
              placeholder="Du"
            />
            <span className="text-xs font-bold text-ink-700">au</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => handleEndDateChange(e.target.value)}
              className="input w-36 py-2 px-3 text-xs"
              placeholder="Au"
            />
          </div>
        )}

        {isFilterActive && (
          <button 
            onClick={handleReset} 
            className="btn-ghost text-sm font-semibold"
          >
            Réinitialiser
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          {selected.size > 0 && (
            <>
              <span className="text-sm font-bold text-ink-900">{selected.size} sélectionnée{selected.size > 1 ? 's' : ''}</span>
              <button
                onClick={bulkDelete}
                className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white shadow-soft hover:bg-red-600"
              >
                <Trash2 size={14} /> Supprimer la sélection
              </button>
            </>
          )}
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-ink-100 text-xs font-black uppercase tracking-wide text-ink-500">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand-500"
                  checked={allChecked}
                  ref={(el) => { if (el) el.indeterminate = someChecked; }}
                  onChange={(e) => toggleAll(e.target.checked)}
                  aria-label="Tout sélectionner"
                />
              </th>
              <th className="px-4 py-3 text-left">ID</th>
              <th className="px-4 py-3 text-left">Client</th>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Téléphone</th>
              <th className="px-4 py-3 text-left">Ville</th>
              <th className="px-4 py-3 text-left">Statut</th>
              <th className="px-4 py-3 text-left">Expédition</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const phoneKey = (o.customer?.phone || '').replace(/\s/g, '');
              const repeats = phoneKey ? (repeatCounts[phoneKey] ?? 0) : 0;
              const isRegular = repeats > 1;
              const tone = getOrderStatusTone(String(o.status));
              const isSelected = selected.has(o.id);
              return (
                <tr
                  key={o.id}
                  className={`border-t border-ink-200 transition ${isSelected ? 'bg-brand-50/60' : 'hover:bg-ink-100'} ${pending ? 'opacity-60' : ''}`}
                >
                  <td className="px-4 py-3">
                    <input
                       type="checkbox"
                       className="h-4 w-4 accent-brand-500"
                       checked={isSelected}
                       onChange={() => toggleOne(o.id)}
                       aria-label={`Sélectionner #${o.number}`}
                    />
                  </td>
                  <td className="px-4 py-3 font-bold">#{o.number}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{o.customer?.firstName} {o.customer?.lastName ?? ''}</span>
                      {isRegular && <CustomerBadge phone={o.customer?.phone ?? ''} apiBase={apiBase} />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-700">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-ink-900">{formatDate(o.createdAt)}</span>
                      {o.confirmedAt && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60 w-fit" title={`Confirmée le ${formatDateTime(o.confirmedAt)}`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 flex-none" />
                          Conf: {formatDateTime(o.confirmedAt)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">{o.customer?.phone}</td>
                  <td className="px-4 py-3">{o.customer?.city}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${tone}`}>
                      {getOrderStatusLabel(String(o.status))}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const deliveryCompany = String(o.meta?._mzem_delivery_company || '');
                      const navexTracking = String(o.meta?._navex_tracking || '');
                      const fdTracking = String(o.meta?._fd_tracking || '');
                      const navexStatus = o.meta?._navex_status;
                      const fdStatus = o.meta?._fd_status;

                      if (navexTracking) {
                        return (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex w-fit items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                              Navex ✓
                            </span>
                            <span className="text-[10px] font-mono text-ink-700">{navexTracking}</span>
                          </div>
                        );
                      }
                      if (fdTracking) {
                        return (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex w-fit items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                              First ✓
                            </span>
                            <span className="text-[10px] font-mono text-ink-700">{fdTracking}</span>
                          </div>
                        );
                      }

                      if (deliveryCompany.toLowerCase().includes('navex')) {
                        if (navexStatus === 'failed') {
                          return (
                            <span className="inline-flex items-center gap-1 rounded bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-red-200" title={String(o.meta?._navex_error || 'Erreur')}>
                              Navex ✗ Échec
                            </span>
                          );
                        }
                        return (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200">
                            Navex (Prêt)
                          </span>
                        );
                      }

                      if (deliveryCompany.toLowerCase().includes('first') || deliveryCompany.toLowerCase().includes('delivery')) {
                        if (fdStatus === 'failed') {
                          return (
                            <span className="inline-flex items-center gap-1 rounded bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-red-200" title={String(o.meta?._fd_error || 'Erreur')}>
                              First ✗ Échec
                            </span>
                          );
                        }
                        return (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200">
                            First (Prêt)
                          </span>
                        );
                      }

                      if (deliveryCompany) {
                        return <span className="text-xs font-semibold text-ink-700 italic">{deliveryCompany}</span>;
                      }

                      return <span className="text-xs text-ink-400">—</span>;
                    })()}
                  </td>
                  <td className="px-4 py-3 text-right font-bold">{formatPrice(o.total)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(o.id)} className="rounded-lg p-2 text-ink-700 hover:bg-ink-100" title="Voir"><Eye size={16} /></button>
                      <button onClick={() => openEdit(o.id)} className="rounded-lg p-2 text-ink-700 hover:bg-ink-100" title="Modifier"><Edit size={16} /></button>
                      <button onClick={() => remove(o.id)} className="rounded-lg p-2 text-red-500 hover:bg-red-50" title="Supprimer"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!orders.length && (
              <tr>
                <td colSpan={10} className="p-8 text-center text-ink-700">
                  Aucune commande trouvée.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Case A: Classic numbered pagination when no filters are active */}
      {!isFilterActive && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-ink-700">
            {totalPages > 1
              ? `Page ${page} sur ${totalPages} (${formatCount(total)} commande${total > 1 ? 's' : ''})`
              : `${formatCount(total)} commande${total > 1 ? 's' : ''}`}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              {page > 1 && (
                <a
                  href={pending ? '#' : getPageUrl(page - 1)}
                  aria-disabled={pending}
                  className={`rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm font-bold text-ink-900 hover:bg-ink-100 ${pending ? 'pointer-events-none opacity-50' : ''}`}
                >
                  ← Précédent
                </a>
              )}
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let p: number;
                if (totalPages <= 7) {
                  p = i + 1;
                } else if (page <= 4) {
                  p = i + 1;
                } else if (page >= totalPages - 3) {
                  p = totalPages - 6 + i;
                } else {
                  p = page - 3 + i;
                }
                return (
                  <a
                    key={p}
                    href={pending ? '#' : getPageUrl(p)}
                    aria-disabled={pending}
                    className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${
                      p === page
                        ? 'bg-brand-500 text-white'
                        : `border border-ink-200 bg-white text-ink-900 hover:bg-ink-100 ${pending ? 'pointer-events-none opacity-50' : ''}`
                    }`}
                  >
                    {p}
                  </a>
                );
              })}
              {page < totalPages && (
                <a
                  href={pending ? '#' : getPageUrl(page + 1)}
                  aria-disabled={pending}
                  className={`rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm font-bold text-ink-900 hover:bg-ink-100 ${pending ? 'pointer-events-none opacity-50' : ''}`}
                >
                  Suivant →
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* Case B: Single continuous filtered view with chunk status and sentinel */}
      {isFilterActive && (
        <div className="mt-4 flex flex-col items-center justify-center gap-3 p-4 text-sm text-ink-600">
          <div ref={sentinelRef} className="h-4 w-full pointer-events-none" />
          {loadingMore && (
            <div className="flex items-center gap-2 font-semibold text-brand-600 animate-pulse">
              <span className="h-2.5 w-2.5 rounded-full bg-brand-500 animate-ping" />
              Chargement des commandes suivantes ({orders.length} sur {formatCount(total)})…
            </div>
          )}
          {hasMore && !loadingMore && (
            <button
              onClick={() => void loadNextChunk()}
              className="rounded-xl border border-brand-200 bg-white px-5 py-2.5 text-sm font-bold text-brand-600 shadow-sm hover:bg-brand-50 hover:border-brand-300 transition"
            >
              Charger 100 commandes suivantes ({orders.length} sur {formatCount(total)})
            </button>
          )}
          {!hasMore && orders.length > 0 && (
            <p className="font-semibold text-ink-500">
              Toutes les {formatCount(total)} commandes filtrées sont affichées ({orders.length} commandes chargées).
            </p>
          )}
        </div>
      )}

      <OrderDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        orderId={editingId}
        onSaved={applySavedOrder}
        apiBase={apiBase}
      />
    </div>
  );
}
