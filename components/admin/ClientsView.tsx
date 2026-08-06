'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Users, Phone, MapPin, ShoppingBag, AlertCircle, Loader2, Trash2 } from 'lucide-react';
import { formatPrice, formatDate } from '@/lib/site-config';
import { useConfirm } from './ConfirmModal';
import { useToast } from './Toast';

type ClientRow = {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  email: string | null;
  city: string;
  address: string;
  ordersCount: number;
  totalSpentMinor: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
};

type ListResponse = { items: ClientRow[]; total: number; totalPages: number; page: number };

export default function ClientsView() {
  const confirmModal = useConfirm();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => { setPage(1); }, [debouncedQuery]);

  useEffect(() => { setSelectedIds(new Set()); }, [page, debouncedQuery]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), perPage: '20' });
    if (debouncedQuery) params.set('search', debouncedQuery);
    fetch(`/api/admin/customers?${params.toString()}`, { cache: 'no-store' })
      .then(async (res) => {
        if (res.status === 501) { if (!cancelled) setUnavailable(true); return null; }
        if (!res.ok) throw new Error('failed');
        return res.json() as Promise<ListResponse>;
      })
      .then((data) => {
        if (cancelled || !data) return;
        setRows(data.items);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      })
      .catch(() => { if (!cancelled) { setRows([]); setTotal(0); setTotalPages(1); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page, debouncedQuery, reloadKey]);

  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));
  const someSelected = rows.some((row) => selectedIds.has(row.id)) && !allSelected;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(rows.map((row) => row.id)));
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function deleteSelected() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const ok = await confirmModal({
      title: `Supprimer ${ids.length} client${ids.length > 1 ? 's' : ''} ?`,
      message: 'Les commandes passées seront conservées, mais les fiches client sélectionnées seront définitivement supprimées.',
      confirmText: 'Supprimer la sélection',
      tone: 'danger',
    });
    if (!ok) return;

    setDeleting(true);
    try {
      const res = await fetch('/api/admin/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Suppression impossible');
      const count = typeof data.count === 'number' ? data.count : ids.length;
      toast.success(`${count} client${count > 1 ? 's' : ''} supprimé${count > 1 ? 's' : ''}`);
      setSelectedIds(new Set());
      if (ids.length === rows.length && page > 1) setPage((current) => current - 1);
      else setReloadKey((current) => current + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Suppression impossible');
    } finally {
      setDeleting(false);
    }
  }

  const summary = useMemo(() => {
    if (!rows.length) return null;
    const totalSpent = rows.reduce((s, r) => s + r.totalSpentMinor, 0);
    const totalOrders = rows.reduce((s, r) => s + r.ordersCount, 0);
    return { avgOrders: totalOrders / rows.length, avgSpent: totalSpent / rows.length / 1000 };
  }, [rows]);

  if (unavailable) {
    return (
      <div className="p-8">
        <header className="mb-6">
          <h1 className="text-3xl font-black tracking-tight text-ink-900">Clients</h1>
        </header>
        <div className="card flex items-start gap-3 p-6">
          <AlertCircle className="mt-0.5 shrink-0 text-amber-600" size={20} />
          <p className="text-sm font-semibold text-ink-700">
            La fiche client n&apos;est disponible que sur le nouveau backend (mzali-api). Cette boutique fonctionne
            encore avec WooCommerce, qui ne suit pas les clients séparément des commandes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-soft">
            <Users size={22} aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-ink-900">Clients</h1>
            <p className="text-sm font-semibold text-ink-500">
              {total} client{total > 1 ? 's' : ''}
              {summary && ` · ${summary.avgOrders.toFixed(1)} commandes en moyenne · ${formatPrice(summary.avgSpent)} dépensé en moyenne`}
            </p>
          </div>
        </div>
      </header>

      <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-700" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher (nom, téléphone)…"
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
        {selectedIds.size > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-3 rounded-xl bg-ink-900 px-3 py-2 text-white" role="status">
            <span className="text-sm font-bold tabular-nums">
              {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              disabled={deleting}
              className="min-h-11 rounded-lg px-3 text-xs font-bold text-ink-200 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Désélectionner
            </button>
            <button
              type="button"
              onClick={deleteSelected}
              disabled={deleting}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-red-600 px-3 text-xs font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
              {deleting ? 'Suppression…' : 'Supprimer'}
            </button>
          </div>
        )}
      </div>

      <div className={`card overflow-x-auto p-0 ${loading ? 'opacity-60' : ''}`}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-ink-100 text-xs font-black uppercase tracking-wide text-ink-500">
            <tr>
              <th className="w-12 px-4 py-3 text-center">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  disabled={loading || rows.length === 0}
                  aria-label="Sélectionner tous les clients de cette page"
                  className="h-4 w-4 cursor-pointer rounded border-ink-300 accent-brand-600 disabled:cursor-not-allowed"
                />
              </th>
              <th className="px-4 py-3 text-left">Client</th>
              <th className="px-4 py-3 text-left">Téléphone</th>
              <th className="px-4 py-3 text-left">Ville</th>
              <th className="px-4 py-3 text-right">Commandes</th>
              <th className="px-4 py-3 text-right">Total dépensé</th>
              <th className="px-4 py-3 text-left">1ère commande</th>
              <th className="px-4 py-3 text-left">Dernière commande</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const selected = selectedIds.has(c.id);
              const label = `${c.firstName} ${c.lastName}`.trim() || c.phone;
              return (
              <tr key={c.id} className={`border-t border-ink-200 transition ${selected ? 'bg-brand-50' : 'hover:bg-ink-100'}`}>
                <td className="w-12 px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleSelected(c.id)}
                    aria-label={`Sélectionner ${label}`}
                    className="h-4 w-4 cursor-pointer rounded border-ink-300 accent-brand-600"
                  />
                </td>
                <td className="px-4 py-3">
                  <p className="font-bold text-ink-900">{c.firstName} {c.lastName}</p>
                  {c.email && <p className="text-xs text-ink-500">{c.email}</p>}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 text-ink-700">
                    <Phone size={13} className="text-ink-400" /> {c.phone}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 text-ink-700">
                    <MapPin size={13} className="text-ink-400" /> {c.city || '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="inline-flex items-center gap-1.5 justify-end font-black tabular-nums text-brand-600">
                    <ShoppingBag size={13} /> {c.ordersCount}
                    {c.ordersCount > 1 && (
                      <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                        fidèle
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-black tabular-nums text-ink-900">
                  {formatPrice(c.totalSpentMinor / 1000)}
                </td>
                <td className="px-4 py-3 text-ink-500">
                  {c.firstOrderAt ? formatDate(c.firstOrderAt) : '—'}
                </td>
                <td className="px-4 py-3 text-ink-500">
                  {c.lastOrderAt ? formatDate(c.lastOrderAt) : '—'}
                </td>
              </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm font-semibold text-ink-500">
                  Aucun client trouvé.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="btn-ghost min-h-11 disabled:opacity-40"
          >
            Précédent
          </button>
          <span className="text-sm font-bold text-ink-700">Page {page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="btn-ghost min-h-11 disabled:opacity-40"
          >
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}
