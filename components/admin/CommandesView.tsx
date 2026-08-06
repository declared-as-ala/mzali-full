'use client';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, Edit, Trash2, Plus, Search, X, ShoppingBag } from 'lucide-react';
import OrderDrawer from './OrderDrawer';
import CustomerBadge from './CustomerBadge';
import { useToast } from './Toast';
import { formatPrice, formatDate } from '@/lib/site-config';
import { adminLoginHref } from '@/lib/admin-nav';
import type { OrderResponse } from '@/types';

export const STATUS_LABEL: Record<string, string> = {
  pending: 'En attente',
  'en-attente': 'En attente',
  'on-hold': 'En attente',
  processing: 'En traitement',
  confirme: 'Confirmée',
  completed: 'Terminée',
  cancelled: 'Annulée',
  annule: 'Annulée',
  refunded: 'Remboursée',
  failed: 'Échouée',
  tentative: 'Tentative',
  'auto-draft': 'Brouillon',
  'checkout-draft': 'Abandonnée',
  abandoned: 'Abandonnée',
  abondonne: 'Abandonnée',
  trash: 'Supprimée',
};

// Color tones — green=confirmé/livré, red=annulé, orange=tentative, amber=en-attente, blue=processing
export const STATUS_TONE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  'en-attente': 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  'on-hold': 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  processing: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  confirme: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  cancelled: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  annule: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  failed: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  refunded: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
  tentative: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  'auto-draft': 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
  'checkout-draft': 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  abandoned: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  abondonne: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  trash: 'bg-red-50 text-red-700 ring-1 ring-red-200',
};

export const STATUS_CHART_COLOR: Record<string, string> = {
  pending: '#d97706',
  'en-attente': '#d97706',
  'on-hold': '#d97706',
  processing: '#0e55fb',
  confirme: '#059669',
  completed: '#059669',
  cancelled: '#dc2626',
  annule: '#dc2626',
  failed: '#dc2626',
  refunded: '#64748b',
  tentative: '#ea580c',
  'auto-draft': '#64748b',
  'checkout-draft': '#4f46e5',
  abandoned: '#dc2626',
  abondonne: '#dc2626',
  trash: '#dc2626',
};

type Props = {
  initialOrders: OrderResponse[];
  total: number;
  totalPages?: number;
  page?: number;
  repeatCounts?: Record<string, number>;
  tabCounts?: { normal: number; abandoned: number; trash: number };
  statusCounts?: Record<string, number>;
  /** Employees get this exact same view (full list + pagination, not the
   *  separate MyCommandesView) pointed at the employee-scoped proxy routes —
   *  full parity with admin: view, create, edit, delete, all of it. */
  apiBase?: '/api/admin' | '/api/employee';
};

export default function CommandesView({ initialOrders, total, totalPages = 1, page = 1, repeatCounts = {}, tabCounts, statusCounts, apiBase = '/api/admin' }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const qParam = searchParams.get('q') || '';
  const statusParam = searchParams.get('status') || '';
  const tabParam = (searchParams.get('tab') || 'normal') as 'normal' | 'abandoned' | 'trash';
  const datePresetParam = searchParams.get('datePreset') || '';
  const startDateParam = searchParams.get('startDate') || '';
  const endDateParam = searchParams.get('endDate') || '';
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
  const [productFilter, setProductFilter] = useState('');
  const [datePreset, setDatePreset] = useState(datePresetParam);
  const [startDate, setStartDate] = useState(startDateParam);
  const [endDate, setEndDate] = useState(endDateParam);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Sync state with URL params
  useEffect(() => { setActiveTab(tabParam); }, [tabParam]);
  useEffect(() => { setQuery(qParam); }, [qParam]);
  useEffect(() => { setStatusFilter(statusParam); }, [statusParam]);
  useEffect(() => { setDatePreset(datePresetParam); }, [datePresetParam]);
  useEffect(() => { setStartDate(startDateParam); }, [startDateParam]);
  useEffect(() => { setEndDate(endDateParam); }, [endDateParam]);

  const updateFilters = (newParams: Record<string, string | null>) => {
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
  };

  // Debounce search query updates to URL
  useEffect(() => {
    const timer = setTimeout(() => {
      const currentQ = searchParams.get('q') || '';
      if (query !== currentQ) {
        updateFilters({ q: query || null });
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [query, searchParams]);

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

  // Fetch all catalogue products to ensure the filter dropdown shows all items in the store
  const [allProducts, setAllProducts] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    fetch(`${apiBase}/products-picker`)
      .then((r) => r.ok ? r.json() : [])
      .then((d) => Array.isArray(d) && setAllProducts(d))
      .catch(() => {});
  }, [apiBase]);

  // Compute normal vs abandoned counts dynamically based on loaded orders
  const computedCounts = useMemo(() => {
    let normal = 0;
    let abandoned = 0;
    let trash = 0;
    for (const o of orders) {
      const isTrash = o.status === 'trash';
      const isAb = o.status === 'checkout-draft' || o.status === 'abandoned' || o.status === 'abondonne';
      if (isTrash) trash++;
      else if (isAb) abandoned++;
      else normal++;
    }
    return { normal, abandoned, trash };
  }, [orders]);

  const counts = tabCounts ?? computedCounts;

  // Build unique products dynamically using both catalog products and loaded orders
  const productOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of allProducts) {
      if (p.name) set.add(p.name);
    }
    for (const o of orders) {
      for (const item of o.items) {
        if (item.name) set.add(item.name);
      }
    }
    return Array.from(set).sort();
  }, [allProducts, orders]);

  // Build status options dynamically from current data
  const availableStatuses = useMemo(() => {
    if (activeTab === 'normal') {
      return ['en-attente', 'confirme', 'tentative', 'annule'];
    }
    const set = new Set<string>();
    for (const o of orders) {
      if (o.status) {
        const isTrash = o.status === 'trash';
        const isAb = o.status === 'checkout-draft' || o.status === 'abandoned' || o.status === 'abondonne';
        if (activeTab === 'abandoned' && !isAb) continue;
        if (activeTab === 'trash' && !isTrash) continue;
        set.add(String(o.status));
      }
    }
    return Array.from(set);
  }, [orders, activeTab]);

  const localStatusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of orders) {
      if (o.status) {
        const s = String(o.status);
        counts[s] = (counts[s] ?? 0) + 1;
      }
    }
    return counts;
  }, [orders]);

  const activeStatusCounts = statusCounts ?? localStatusCounts;

  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      // Tab filter: separate normal, abandoned, and trash orders
      const isTrash = o.status === 'trash';
      const isAbandoned = o.status === 'checkout-draft' || o.status === 'abandoned' || o.status === 'abondonne';
      if (activeTab === 'trash' && !isTrash) return false;
      if (activeTab === 'abandoned' && !isAbandoned) return false;
      if (activeTab === 'normal' && (isTrash || isAbandoned)) return false;

      // 1. Status Filter
      if (statusFilter) {
        if (statusFilter === 'abandoned') {
          // Strictly match abandoned/draft orders and exclude tentative call attempts
          const isAbandoned = o.status === 'checkout-draft' || o.status === 'abandoned' || o.status === 'abondonne';
          if (!isAbandoned) return false;
        } else if (String(o.status) !== statusFilter) {
          return false;
        }
      }

      // 2. Product Filter
      if (productFilter && !o.items.some((item) => item.name === productFilter)) {
        return false;
      }

      // 3. Date Filter
      if (datePreset) {
        const oDate = new Date(o.createdAt);
        oDate.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (datePreset === 'today') {
          if (oDate.getTime() !== today.getTime()) return false;
        } else if (datePreset === 'yesterday') {
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          if (oDate.getTime() !== yesterday.getTime()) return false;
        } else if (datePreset === '7days') {
          const sevenDaysAgo = new Date(today);
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          if (oDate.getTime() < sevenDaysAgo.getTime()) return false;
        } else if (datePreset === 'month') {
          const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
          if (oDate.getTime() < firstOfMonth.getTime()) return false;
        } else if (datePreset === 'custom') {
          if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            if (oDate.getTime() < start.getTime()) return false;
          }
          if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            if (oDate.getTime() > end.getTime()) return false;
          }
        }
      }

      // 4. Search Query Filter
      if (!q) return true;

      const normQ = q.replace(/\D/g, '');
      const matchPhone = (phone: string) => {
        if (!normQ) return false;
        let cleanPhone = phone.replace(/\D/g, '');
        if (cleanPhone.startsWith('216') && cleanPhone.length > 8 && normQ.length <= 8) {
          cleanPhone = cleanPhone.substring(3);
        }
        let cleanQ = normQ;
        if (cleanQ.startsWith('216') && cleanQ.length > 8 && cleanPhone.length <= 8) {
          cleanQ = cleanQ.substring(3);
        }
        return cleanPhone.includes(cleanQ);
      };

      const matchesPhone = (o.customer?.phone && matchPhone(o.customer.phone)) ||
                           (o.meta?._mzem_phone_2 && typeof o.meta._mzem_phone_2 === 'string' && matchPhone(o.meta._mzem_phone_2));
      if (matchesPhone) return true;

      const hay = [
        o.number,
        o.customer?.firstName,
        o.customer?.lastName,
        o.customer?.phone,
        o.customer?.city,
        o.customer?.email,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [orders, query, statusFilter, productFilter, datePreset, startDate, endDate, activeTab]);

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
    setSelected(checked ? new Set(filteredOrders.map((o) => o.id)) : new Set());
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

  const allChecked = filteredOrders.length > 0 && filteredOrders.every((o) => selected.has(o.id));
  const someChecked = filteredOrders.some((o) => selected.has(o.id)) && !allChecked;

  return (
    <div className="p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-soft">
            <ShoppingBag size={22} aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-ink-900">Commandes</h1>
            <p className="text-sm font-semibold text-ink-500">
              {activeTab === 'normal'
                ? `${counts.normal} commande${counts.normal > 1 ? 's' : ''}`
                : activeTab === 'abandoned'
                ? `${counts.abandoned} commande${counts.abandoned > 1 ? 's' : ''} abandonnée${counts.abandoned > 1 ? 's' : ''}`
                : `${counts.trash} commande${counts.trash > 1 ? 's' : ''} supprimée${counts.trash > 1 ? 's' : ''}`}
            </p>
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
          Normal <span className="tabular-nums opacity-80">({counts.normal})</span>
        </button>
        <button
          onClick={() => handleTabChange('abandoned')}
          aria-pressed={activeTab === 'abandoned'}
          className={`min-h-11 flex-1 cursor-pointer rounded-xl px-5 text-sm font-bold transition sm:flex-none ${
            activeTab === 'abandoned' ? 'bg-indigo-500 text-white shadow-soft' : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900'
          }`}
        >
          Abandonnées <span className="tabular-nums opacity-80">({counts.abandoned})</span>
        </button>
        <button
          onClick={() => handleTabChange('trash')}
          aria-pressed={activeTab === 'trash'}
          className={`min-h-11 flex-1 cursor-pointer rounded-xl px-5 text-sm font-bold transition sm:flex-none ${
            activeTab === 'trash' ? 'bg-rose-500 text-white shadow-soft' : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900'
          }`}
        >
          Supprimées <span className="tabular-nums opacity-80">({counts.trash})</span>
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
          <select
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="input w-44"
          >
            <option value="">Tous les statuts</option>
            {availableStatuses.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s] ?? s} {activeStatusCounts[s] !== undefined && activeStatusCounts[s] > 0 ? `×${activeStatusCounts[s]}` : ''}
              </option>
            ))}
          </select>
        )}

        <select
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          className="input w-44"
        >
          <option value="">Tous les produits</option>
          {productOptions.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
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

        {(query || statusFilter || productFilter || datePreset) && (
          <button 
            onClick={() => { 
              setQuery(''); 
              setProductFilter(''); 
              updateFilters({ q: null, status: null, datePreset: null, startDate: null, endDate: null });
            }} 
            className="btn-ghost"
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
            {filteredOrders.map((o) => {
              const phoneKey = (o.customer?.phone || '').replace(/\s/g, '');
              const repeats = phoneKey ? (repeatCounts[phoneKey] ?? 0) : 0;
              const isRegular = repeats > 1;
              const tone = STATUS_TONE[String(o.status)] ?? 'bg-ink-100 text-ink-700 ring-1 ring-ink-200';
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
                  <td className="px-4 py-3 text-ink-700">{formatDate(o.createdAt)}</td>
                  <td className="px-4 py-3">{o.customer?.phone}</td>
                  <td className="px-4 py-3">{o.customer?.city}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${tone}`}>
                      {o.status === 'tentative' ? `Tentative ${o.meta?._mzem_attempts ?? 1}` : (STATUS_LABEL[o.status] ?? o.status)}
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
             {!filteredOrders.length && (
              <tr>
                <td colSpan={11} className="p-8 text-center text-ink-700">
                  {orders.length === 0 ? 'Aucune commande pour le moment.' : 'Aucun résultat.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-ink-700">
            Page {page} sur {totalPages} ({total} commande{total > 1 ? 's' : ''})
          </p>
          <div className="flex items-center gap-1">
            {page > 1 && (
              <a
                href={getPageUrl(page - 1)}
                className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm font-bold text-ink-900 hover:bg-ink-100"
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
                  href={getPageUrl(p)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${
                    p === page
                      ? 'bg-brand-500 text-white'
                      : 'border border-ink-200 bg-white text-ink-900 hover:bg-ink-100'
                  }`}
                >
                  {p}
                </a>
              );
            })}
            {page < totalPages && (
              <a
                href={getPageUrl(page + 1)}
                className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm font-bold text-ink-900 hover:bg-ink-100"
              >
                Suivant →
              </a>
            )}
          </div>
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
