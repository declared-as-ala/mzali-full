'use client';
import { useEffect, useMemo, useState } from 'react';
import { Building2, Download, FileText, Minus, Plus, Printer, RefreshCw, Search, ShoppingBag, Wallet, X } from 'lucide-react';
import { useToast } from './Toast';

type Supplier = { id: string; companyName: string };
type SupplierProduct = {
  id: string;
  name: string;
  category: string | null;
  brand: string | null;
  size: string | null;
  color: string | null;
  purchasePriceMinor: number;
  active: boolean;
};

type PoLine = {
  supplierProductId: string | null;
  name: string;
  category: string | null;
  brand: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
};

type PurchaseOrder = {
  id: string;
  poNumber: number;
  supplierId: string;
  supplierName: string;
  orderDate: string;
  lines: PoLine[];
  totalMinor: number;
  notes: string | null;
  status: 'DRAFT' | 'SENT' | 'COMPLETED' | 'CANCELLED';
  pdfMediaId: string | null;
  createdAt: string;
};

const STATUS_LABEL: Record<string, string> = { DRAFT: 'Brouillon', SENT: 'Envoyé', COMPLETED: 'Terminé', CANCELLED: 'Annulé' };
const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700', SENT: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700', CANCELLED: 'bg-rose-100 text-rose-700',
};

function formatMinor(minor: number): string {
  return `${(minor / 1000).toFixed(3)} DT`;
}

export default function PurchaseOrdersView() {
  const toast = useToast();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [printing, setPrinting] = useState<PurchaseOrder | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/supplier-purchase-orders', { cache: 'no-store' });
      setOrders(res.ok ? await res.json() : []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function setStatus(po: PurchaseOrder, status: PurchaseOrder['status']) {
    const res = await fetch(`/api/admin/supplier-purchase-orders/${po.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) { toast.error('Erreur'); return; }
    load();
  }

  const totalValue = orders.reduce((s, o) => s + o.totalMinor, 0);
  const openCount = orders.filter((o) => o.status === 'DRAFT' || o.status === 'SENT').length;

  return (
    <div className="p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink-900">Bons de commande</h1>
          <p className="text-ink-600">Sélectionnez un fournisseur et ses produits pour générer un bon de commande à imprimer.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="btn-ghost inline-flex items-center gap-2">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualiser
          </button>
          <button onClick={() => setCreating(true)} className="btn-primary inline-flex items-center gap-2 shadow-lg shadow-brand-500/20">
            <Plus size={16} /> Nouveau bon de commande
          </button>
        </div>
      </header>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-2xl border border-ink-200 bg-white p-4 shadow-card">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600"><FileText size={20} /></div>
          <div>
            <p className="text-2xl font-black text-ink-900">{orders.length}</p>
            <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Bons de commande</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-ink-200 bg-white p-4 shadow-card">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600"><ShoppingBag size={20} /></div>
          <div>
            <p className="text-2xl font-black text-ink-900">{openCount}</p>
            <p className="text-xs font-bold uppercase tracking-wide text-ink-500">En cours</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-ink-200 bg-white p-4 shadow-card">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><Wallet size={20} /></div>
          <div>
            <p className="text-2xl font-black text-ink-900">{formatMinor(totalValue)}</p>
            <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Valeur totale</p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-100 text-xs font-black uppercase text-ink-700">
            <tr>
              <th className="px-4 py-3">Numéro</th>
              <th className="px-4 py-3">Fournisseur</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((po) => (
              <tr key={po.id} className="border-t border-ink-200 transition-colors hover:bg-slate-50">
                <td className="px-4 py-3 font-black text-brand-700">PO-{po.poNumber}</td>
                <td className="px-4 py-3 font-bold text-ink-900">{po.supplierName}</td>
                <td className="px-4 py-3 text-xs text-ink-700">{new Date(po.orderDate).toLocaleDateString('fr-TN')}</td>
                <td className="px-4 py-3 text-right font-black text-ink-900">{formatMinor(po.totalMinor)}</td>
                <td className="px-4 py-3">
                  <select
                    value={po.status}
                    onChange={(e) => setStatus(po, e.target.value as PurchaseOrder['status'])}
                    className={`rounded-full border-0 px-2 py-1 text-xs font-black outline-none cursor-pointer ${STATUS_COLOR[po.status]}`}
                  >
                    {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3 max-w-[160px] truncate text-xs text-ink-500">{po.notes ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setPrinting(po)} title="Aperçu / Imprimer" className="grid h-8 w-8 place-items-center rounded-lg text-ink-600 hover:bg-ink-100">
                      <Printer size={15} />
                    </button>
                    {po.pdfMediaId ? (
                      <a href={`/api/admin/media/${po.pdfMediaId}/download`} target="_blank" rel="noreferrer" title="Télécharger le PDF" className="grid h-8 w-8 place-items-center rounded-lg text-emerald-600 hover:bg-emerald-50">
                        <Download size={15} />
                      </a>
                    ) : (
                      <span title="PDF en cours de génération" className="grid h-8 w-8 place-items-center text-ink-300">
                        <Download size={15} />
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!orders.length && (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-ink-500">Aucun bon de commande pour le moment.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {creating && <CreatePoDrawer onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
      {printing && <PoPrintModal po={printing} onClose={() => setPrinting(null)} />}
    </div>
  );
}

function CreatePoDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [catalog, setCatalog] = useState<SupplierProduct[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [search, setSearch] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/admin/suppliers').then((r) => (r.ok ? r.json() : [])).then(setSuppliers).catch(() => {});
  }, []);

  useEffect(() => {
    setQuantities({});
    if (!supplierId) { setCatalog([]); return; }
    setLoadingCatalog(true);
    fetch(`/api/admin/supplier-products?supplierId=${supplierId}&status=active`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: SupplierProduct[]) => setCatalog(Array.isArray(rows) ? rows : []))
      .catch(() => setCatalog([]))
      .finally(() => setLoadingCatalog(false));
  }, [supplierId]);

  const selectedSupplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const visible = catalog.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  const selectedLines = useMemo(() => catalog.filter((p) => (quantities[p.id] ?? 0) > 0), [catalog, quantities]);
  const total = selectedLines.reduce((s, p) => s + p.purchasePriceMinor * (quantities[p.id] ?? 0), 0);

  function setQty(id: string, qty: number) {
    setQuantities((prev) => ({ ...prev, [id]: Math.max(0, qty) }));
  }

  async function submit() {
    if (!supplierId) { toast.error('Choisissez un fournisseur'); return; }
    if (!selectedLines.length) { toast.error('Sélectionnez au moins un produit'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/supplier-purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId,
          notes: notes.trim() || undefined,
          lines: selectedLines.map((p) => ({
            supplierProductId: p.id,
            name: p.name,
            category: p.category ?? undefined,
            brand: p.brand ?? undefined,
            size: p.size ?? undefined,
            color: p.color ?? undefined,
            quantity: quantities[p.id],
            unitPrice: p.purchasePriceMinor / 1000,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error ?? 'Erreur'); return; }
      toast.success('Bon de commande généré');
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink-200 bg-gradient-to-r from-brand-500 to-brand-600 p-5">
          <h2 className="text-xl font-black text-white">Nouveau bon de commande</h2>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-white/80 hover:bg-white/15"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-ink-700">Fournisseur</span>
            {!selectedSupplier ? (
              suppliers.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {suppliers.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSupplierId(s.id)}
                      className="flex items-center gap-2.5 rounded-xl border border-ink-200 bg-white p-3 text-left transition hover:border-brand-300 hover:bg-brand-50"
                    >
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-500"><Building2 size={16} /></div>
                      <span className="truncate text-sm font-bold text-ink-900">{s.companyName}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl bg-ink-100 p-4 text-sm text-ink-600">
                  Aucun fournisseur. <a href="/admin/suppliers" className="font-bold text-brand-600 hover:underline">Créez-en un d'abord →</a>
                </p>
              )
            ) : (
              <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50 p-3">
                <span className="flex items-center gap-2.5 text-sm font-bold text-ink-900">
                  <Building2 size={16} className="text-brand-600" /> {selectedSupplier.companyName}
                </span>
                <button onClick={() => setSupplierId('')} className="text-xs font-bold text-brand-600 hover:underline">Changer</button>
              </div>
            )}
          </div>

          {supplierId && (
            <>
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input className="input pl-9" placeholder="Rechercher un produit…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>

              <div className="max-h-80 space-y-1.5 overflow-y-auto rounded-xl border border-ink-200 p-2">
                {loadingCatalog ? (
                  <p className="p-4 text-center text-sm text-ink-500">Chargement du catalogue…</p>
                ) : !visible.length ? (
                  <div className="p-4 text-center text-sm text-ink-600">
                    <p className="mb-1">Ce fournisseur n'a pas encore de produits dans son catalogue.</p>
                    <a href="/admin/suppliers" className="font-bold text-brand-600 hover:underline">Ajouter des produits à ce fournisseur →</a>
                  </div>
                ) : (
                  visible.map((p) => {
                    const qty = quantities[p.id] ?? 0;
                    return (
                      <div key={p.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 transition ${qty > 0 ? 'bg-brand-50 ring-1 ring-brand-200' : 'bg-ink-100'}`}>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-ink-900">{p.name}</p>
                          <p className="truncate text-[11px] text-ink-500">{[p.category, p.brand, p.size, p.color].filter(Boolean).join(' · ') || '—'} · {formatMinor(p.purchasePriceMinor)}</p>
                        </div>
                        <button onClick={() => setQty(p.id, qty - 1)} disabled={qty === 0} className="grid h-7 w-7 place-items-center rounded-lg bg-white text-ink-600 shadow-sm disabled:opacity-30"><Minus size={13} /></button>
                        <input
                          type="number"
                          min={0}
                          className="w-14 rounded-lg border border-ink-200 bg-white py-1 text-center text-xs font-bold"
                          value={qty}
                          onChange={(e) => setQty(p.id, Number(e.target.value) || 0)}
                        />
                        <button onClick={() => setQty(p.id, qty + 1)} className="grid h-7 w-7 place-items-center rounded-lg bg-white text-ink-600 shadow-sm"><Plus size={13} /></button>
                      </div>
                    );
                  })
                )}
              </div>

              <label className="block text-sm font-bold">Notes
                <textarea className="input mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Instructions de livraison, conditions…" />
              </label>
            </>
          )}
        </div>

        {supplierId && (
          <div className="border-t border-ink-200 bg-ink-100/60 p-5">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-bold text-ink-700">{selectedLines.length} produit(s) sélectionné(s)</span>
              <span className="text-2xl font-black text-ink-900">{formatMinor(total)}</span>
            </div>
            <button disabled={busy || !selectedLines.length} onClick={submit} className="btn-primary w-full py-3 text-base shadow-lg shadow-brand-500/20 disabled:opacity-40 disabled:shadow-none">
              {busy ? 'Génération…' : 'Générer le bon de commande'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PoPrintModal({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4 print:static print:bg-white print:p-0" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl print:max-h-none print:overflow-visible print:rounded-none print:shadow-none" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink-200 p-4 print:hidden">
          <h3 className="flex items-center gap-2 text-sm font-black text-ink-900"><FileText size={16} /> Aperçu — PO-{po.poNumber}</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"><Printer size={13} /> Imprimer</button>
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-100"><X size={16} /></button>
          </div>
        </div>

        <div id="print-area">
          {/* Letterhead */}
          <div className="bg-gradient-to-r from-brand-600 to-brand-500 px-8 py-7 text-white">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/70">Bon de commande</p>
                <h1 className="mt-1 text-3xl font-black">PO-{po.poNumber}</h1>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold uppercase tracking-wide text-white/70">Date</p>
                <p className="text-sm font-bold">{new Date(po.orderDate).toLocaleDateString('fr-TN', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
              </div>
            </div>
          </div>

          <div className="p-8">
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-ink-200 bg-ink-50 p-4">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700"><Building2 size={20} /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-brand-600">Fournisseur</p>
                <p className="text-lg font-black text-ink-900">{po.supplierName}</p>
              </div>
            </div>

            <table className="w-full text-left text-sm">
              <thead className="border-b-2 border-ink-900 text-xs font-black uppercase text-ink-700">
                <tr>
                  <th className="py-2">Produit</th>
                  <th className="py-2 text-center">Qté</th>
                  <th className="py-2 text-right">Prix</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {po.lines.map((l, i) => (
                  <tr key={i} className={i % 2 === 1 ? 'bg-ink-50/60' : ''}>
                    <td className="py-2.5 px-1">
                      <p className="font-bold text-ink-900">{l.name}</p>
                      {[l.brand, l.size, l.color].filter(Boolean).length > 0 && (
                        <p className="text-[11px] text-ink-500">{[l.brand, l.size, l.color].filter(Boolean).join(' · ')}</p>
                      )}
                    </td>
                    <td className="py-2.5 px-1 text-center font-bold">{l.quantity}</td>
                    <td className="py-2.5 px-1 text-right font-mono">{formatMinor(l.unitPriceMinor)}</td>
                    <td className="py-2.5 px-1 text-right font-mono font-bold">{formatMinor(l.lineTotalMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 flex justify-end">
              <div className="w-56 rounded-xl bg-ink-900 px-5 py-4 text-white">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide text-white/70">Total</span>
                  <span className="text-2xl font-black">{formatMinor(po.totalMinor)}</span>
                </div>
              </div>
            </div>

            {po.notes && (
              <div className="mt-6 rounded-xl border border-ink-200 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-ink-500">Notes</p>
                <p className="mt-1 text-sm text-ink-700">{po.notes}</p>
              </div>
            )}

            <div className="mt-16 grid grid-cols-2 gap-8">
              <div className="rounded-xl border border-dashed border-ink-300 p-4 text-center">
                <div className="h-12" />
                <div className="border-t border-ink-300 pt-2 text-xs font-bold text-ink-500">Signature fournisseur</div>
              </div>
              <div className="rounded-xl border border-dashed border-ink-300 p-4 text-center">
                <div className="h-12" />
                <div className="border-t border-ink-300 pt-2 text-xs font-bold text-ink-500">Signature responsable achats</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
