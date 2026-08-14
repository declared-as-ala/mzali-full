'use client';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Edit, Trash2, Search, X } from 'lucide-react';
import OrderDrawer from '@/components/admin/OrderDrawer';
import { useToast } from '@/components/admin/Toast';
import { formatPrice, formatDate, formatDateTime } from '@/lib/site-config';
import { getOrderStatusLabel, getOrderStatusTone } from '@/lib/order-status';
import type { OrderResponse } from '@/types';

export default function MyCommandesView() {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();

  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'normal' | 'abandoned' | 'trash'>('normal');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [datePreset, setDatePreset] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Fetch all catalogue products to ensure the filter dropdown shows all items in the store
  const [allProducts, setAllProducts] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    fetch('/api/employee/products-picker')
      .then((r) => r.ok ? r.json() : [])
      .then((d) => Array.isArray(d) && setAllProducts(d))
      .catch(() => {});
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/employee/orders', { cache: 'no-store' });
      const data = await res.json();
      setOrders(Array.isArray(data?.items) ? data.items : []);
    } finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);

  // Compute normal vs abandoned counts dynamically based on loaded orders
  const counts = useMemo(() => {
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

  const availableStatuses = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) {
      if (o.status) {
        const isTrash = o.status === 'trash';
        const isAb = o.status === 'checkout-draft' || o.status === 'abandoned' || o.status === 'abondonne';
        // Only include statuses corresponding to the active tab
        if (activeTab === 'normal' && (isTrash || isAb)) continue;
        if (activeTab === 'abandoned' && !isAb) continue;
        if (activeTab === 'trash' && !isTrash) continue;
        set.add(String(o.status));
      }
    }
    return Array.from(set);
  }, [orders, activeTab]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of orders) {
      if (o.status) {
        const s = String(o.status);
        counts[s] = (counts[s] ?? 0) + 1;
      }
    }
    return counts;
  }, [orders]);

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
        const targetDateStr = (statusFilter === 'confirme' && o.confirmedAt) ? o.confirmedAt : o.createdAt;
        const oDate = new Date(targetDateStr);
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

      const matchesPhone = (o.customer.phone && matchPhone(o.customer.phone)) || 
                           (o.meta?._mzem_phone_2 && typeof o.meta._mzem_phone_2 === 'string' && matchPhone(o.meta._mzem_phone_2));
      if (matchesPhone) return true;

      const hay = [
        o.number,
        o.customer.firstName, o.customer.lastName,
        o.customer.phone, o.customer.city, o.customer.email,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [orders, query, statusFilter, productFilter, datePreset, startDate, endDate, activeTab]);

  function openEdit(id: string) { setEditingId(id); setDrawerOpen(true); }

  function toggleOne(id: string) {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
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
    const res = await fetch(`/api/employee/orders/${id}`, { method: 'DELETE' });
    if (!res.ok) { setOrders(snapshot); toast.error('Erreur de suppression'); return; }
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
      ids.map((id) => fetch(`/api/employee/orders/${id}`, { method: 'DELETE' }).then((r) => r.ok ? id : Promise.reject(id))),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - ok;
    if (ok) toast.success(`${ok} commande${ok > 1 ? 's' : ''} supprimée${ok > 1 ? 's' : ''}`);
    if (failed) { toast.error(`${failed} échec${failed > 1 ? 's' : ''}`); setOrders(snapshot); }
    startTransition(() => router.refresh());
  }

  function applySavedOrder(o: OrderResponse) {
    setOrders((prev) => {
      const idx = prev.findIndex((x) => x.id === o.id);
      if (idx >= 0) { const next = prev.slice(); next[idx] = o; return next; }
      return [o, ...prev];
    });
    toast.success(`Commande #${o.number} enregistrée`);
    startTransition(() => router.refresh());
  }

  const allChecked = filteredOrders.length > 0 && filteredOrders.every((o) => selected.has(o.id));
  const someChecked = filteredOrders.some((o) => selected.has(o.id)) && !allChecked;

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-3xl font-black">Mes commandes</h1>
        <p className="text-ink-700">
          {activeTab === 'normal'
            ? `${counts.normal} commande${counts.normal > 1 ? 's' : ''}`
            : activeTab === 'abandoned'
            ? `${counts.abandoned} commande${counts.abandoned > 1 ? 's' : ''} abandonnée${counts.abandoned > 1 ? 's' : ''}`
            : `${counts.trash} commande${counts.trash > 1 ? 's' : ''} supprimée${counts.trash > 1 ? 's' : ''}`}
        </p>
      </header>

      {/* Segregated tabs for normal orders, abandoned checkouts, and trashed orders */}
      <div className="mb-6 flex border-b border-ink-200">
        <button
          onClick={() => { setActiveTab('normal'); setStatusFilter(''); }}
          className={`px-6 py-3 font-bold text-sm border-b-2 transition duration-200 outline-none ${
            activeTab === 'normal'
              ? 'border-brand-500 text-brand-600 font-extrabold'
              : 'border-transparent text-ink-700 hover:text-ink-900 hover:border-ink-300'
          }`}
        >
          Normal ({counts.normal})
        </button>
        <button
          onClick={() => { setActiveTab('abandoned'); setStatusFilter(''); }}
          className={`px-6 py-3 font-bold text-sm border-b-2 transition duration-200 outline-none ${
            activeTab === 'abandoned'
              ? 'border-indigo-500 text-indigo-600 font-extrabold'
              : 'border-transparent text-ink-700 hover:text-ink-900 hover:border-ink-300'
          }`}
        >
          Abandonnées ({counts.abandoned})
        </button>
        <button
          onClick={() => { setActiveTab('trash'); setStatusFilter(''); }}
          className={`px-6 py-3 font-bold text-sm border-b-2 transition duration-200 outline-none ${
            activeTab === 'trash'
              ? 'border-red-500 text-red-600 font-extrabold'
              : 'border-transparent text-ink-700 hover:text-ink-900 hover:border-ink-300'
          }`}
        >
          Supprimées ({counts.trash})
        </button>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1 min-w-[220px]">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-700" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher (numéro, client, téléphone, ville)…"
            className="input pl-9"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-700 hover:bg-ink-100"><X size={14} /></button>
          )}
        </div>
        {activeTab === 'normal' && (
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input w-44">
            <option value="">Tous les statuts</option>
            {availableStatuses.map((s) => (
              <option key={s} value={s}>
                {getOrderStatusLabel(s)} ×{statusCounts[s] ?? 0}
              </option>
            ))}
          </select>
        )}

        <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)} className="input w-44">
          <option value="">Tous les produits</option>
          {productOptions.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>

        <select value={datePreset} onChange={(e) => setDatePreset(e.target.value)} className="input w-44">
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
              onChange={(e) => setStartDate(e.target.value)}
              className="input w-36 py-2 px-3 text-xs"
              placeholder="Du"
            />
            <span className="text-xs font-bold text-ink-700">au</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input w-36 py-2 px-3 text-xs"
              placeholder="Au"
            />
          </div>
        )}

        {(query || statusFilter || productFilter || datePreset) && (
          <button 
            onClick={() => { 
              setQuery(''); 
              setStatusFilter(''); 
              setProductFilter(''); 
              setDatePreset(''); 
              setStartDate(''); 
              setEndDate(''); 
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

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-ink-100 text-xs uppercase text-ink-700">
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
              <th className="px-4 py-3 text-left">Téléphone</th>
              <th className="px-4 py-3 text-left">Ville</th>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Statut</th>
              <th className="px-4 py-3 text-left">Expédition</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={10} className="p-6 text-center text-ink-700">Chargement…</td></tr>}
            {!loading && filteredOrders.map((o) => {
              const tone = getOrderStatusTone(String(o.status));
              const isSelected = selected.has(o.id);
              return (
                <tr key={o.id} className={`border-t border-ink-200 transition ${isSelected ? 'bg-brand-50/60' : 'hover:bg-ink-100'}`}>
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
                    <div className="flex flex-col">
                      <span>{o.customer.firstName} {o.customer.lastName ?? ''}</span>
                      {o.customer.email && <span className="text-xs text-ink-700">{o.customer.email}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">{o.customer.phone}</td>
                  <td className="px-4 py-3">{o.customer.city}</td>
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
            {!loading && !filteredOrders.length && (
              <tr><td colSpan={10} className="p-8 text-center text-ink-700">{orders.length === 0 ? 'Aucune commande.' : 'Aucun résultat.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <OrderDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        orderId={editingId}
        onSaved={applySavedOrder}
        apiBase="/api/employee"
      />
    </div>
  );
}
