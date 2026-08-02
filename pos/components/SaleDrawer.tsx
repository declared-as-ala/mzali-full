'use client';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Minus, Plus, Search, ShieldAlert, Trash2, X } from 'lucide-react';
import { posFetch } from '@/lib/device';
import { formatMinor } from '@/lib/money';
import type { PosCatalogItem, PosCatalogResponse, PosSale, PosSaleLine } from '@/types/pos';
import PrintMenu, { PrintFormat } from './PrintMenu';

type EditLine = { variantId: string; name: string; sku: string; qty: number; unitPriceMinor: number; discountMinor: number };
type EditPayment = { method: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'OTHER'; amountDt: string };

const PAYMENT_METHODS: { value: EditPayment['method']; label: string }[] = [
  { value: 'CASH', label: 'Espèces' },
  { value: 'CARD', label: 'Carte' },
  { value: 'BANK_TRANSFER', label: 'Virement' },
  { value: 'OTHER', label: 'Autre' },
];

export default function SaleDrawer({ sale, canEdit, initialEdit = false, onClose, onPrint, onSaved }: {
  sale: PosSale;
  canEdit: boolean;
  initialEdit?: boolean;
  onClose: () => void;
  onPrint: (sale: PosSale, format: PrintFormat) => void;
  onSaved: (sale: PosSale) => void;
}) {
  const [editing, setEditing] = useState(initialEdit);
  const [lines, setLines] = useState<EditLine[]>(() => toEditLines(sale.lines));
  const [discountDt, setDiscountDt] = useState(String(sale.discountMinor / 1000));
  const [payments, setPayments] = useState<EditPayment[]>(() =>
    sale.payments.map((p) => ({ method: p.method, amountDt: String(p.amountMinor / 1000) })),
  );
  const [notes, setNotes] = useState(sale.notes ?? '');
  const [reason, setReason] = useState('');
  const [catalog, setCatalog] = useState<PosCatalogResponse | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing || catalog) return;
    posFetch('/api/catalog', { cache: 'no-store' }).then((r) => r.json()).then(setCatalog).catch(() => {});
  }, [editing, catalog]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !editing) onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editing, onClose]);

  const subtotalMinor = lines.reduce((sum, l) => sum + l.unitPriceMinor * l.qty - l.discountMinor, 0);
  const discountMinor = Math.round((Number(discountDt) || 0) * 1000);
  const totalMinor = Math.max(0, subtotalMinor - discountMinor);
  const paymentsSum = payments.reduce((sum, p) => sum + Math.round((Number(p.amountDt) || 0) * 1000), 0);
  const paymentsBalanced = paymentsSum === totalMinor;

  const searchResults = useMemo(() => {
    if (!catalog || !productSearch.trim()) return [];
    const q = productSearch.toLowerCase();
    return catalog.items.filter((i) => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)).slice(0, 6);
  }, [catalog, productSearch]);

  function addLine(item: PosCatalogItem) {
    setLines((prev) => {
      const existing = prev.find((l) => l.variantId === item.variantId);
      if (existing) return prev.map((l) => (l.variantId === item.variantId ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { variantId: item.variantId, name: item.name, sku: item.sku, qty: 1, unitPriceMinor: item.priceMinor, discountMinor: 0 }];
    });
    setProductSearch('');
  }

  function updateQty(variantId: string, qty: number) {
    if (qty <= 0) { setLines((prev) => prev.filter((l) => l.variantId !== variantId)); return; }
    setLines((prev) => prev.map((l) => (l.variantId === variantId ? { ...l, qty } : l)));
  }

  async function save() {
    if (!reason.trim()) { setError('Un motif est requis pour modifier une vente.'); return; }
    if (!lines.length) { setError('La vente doit contenir au moins un article.'); return; }
    if (!paymentsBalanced) { setError('La somme des paiements doit correspondre au total.'); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await posFetch(`/api/sales/${sale.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: lines.map((l) => ({ variantId: l.variantId, qty: l.qty, discountMinor: l.discountMinor })),
          discountMinor,
          payments: payments.map((p) => ({ method: p.method, amountMinor: Math.round((Number(p.amountDt) || 0) * 1000) })),
          notes: notes.trim() || null,
          reason: reason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Échec de la modification');
      onSaved(data);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <div className="drawer-slide-in flex h-full w-full max-w-lg flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 p-5">
          <div>
            <h2 className="text-lg font-black text-slate-900">Vente #{sale.saleNumber}</h2>
            <p className="text-xs text-slate-500">{new Date(sale.createdAt).toLocaleString('fr-FR')} · {sale.cashierName}</p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-100" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!canEdit && sale.status === 'COMPLETED' && (
            <p className="flex items-center gap-2 rounded-2xl bg-slate-50 border border-slate-200 p-3 text-xs font-semibold text-slate-500">
              <ShieldAlert size={14} /> Vous n&apos;avez pas la permission de modifier cette vente.
            </p>
          )}

          <div className="space-y-2">
            {lines.map((l) => (
              <div key={l.variantId} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-800">{l.name}</p>
                  <p className="text-[11px] text-slate-400">{l.sku} · {formatMinor(l.unitPriceMinor)}</p>
                </div>
                {editing ? (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => updateQty(l.variantId, l.qty - 1)} className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 hover:bg-slate-50">
                      <Minus size={12} />
                    </button>
                    <span className="w-6 text-center text-xs font-black">{l.qty}</span>
                    <button onClick={() => updateQty(l.variantId, l.qty + 1)} className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 hover:bg-slate-50">
                      <Plus size={12} />
                    </button>
                    <button onClick={() => updateQty(l.variantId, 0)} className="grid h-7 w-7 place-items-center rounded-lg text-rose-500 hover:bg-rose-50">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ) : (
                  <p className="text-xs font-black text-slate-900">{l.qty} × {formatMinor(l.unitPriceMinor)}</p>
                )}
              </div>
            ))}
          </div>

          {editing && (
            <div className="relative">
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 px-3.5 py-2.5">
                <Search size={14} className="text-slate-400" />
                <input
                  className="flex-1 bg-transparent text-xs font-semibold outline-none placeholder:text-slate-400"
                  placeholder="Ajouter un produit…"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
              </div>
              {searchResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-2xl border border-slate-200 bg-white shadow-lg">
                  {searchResults.map((item) => (
                    <button key={item.variantId} onClick={() => addLine(item)} className="flex w-full items-center justify-between px-3.5 py-2 text-left text-xs hover:bg-slate-50">
                      <span className="font-bold text-slate-700">{item.name}</span>
                      <span className="text-slate-400">{formatMinor(item.priceMinor)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5 rounded-2xl bg-slate-50 p-3.5 text-xs">
            <div className="flex justify-between"><span className="text-slate-500">Sous-total</span><span className="font-bold">{formatMinor(subtotalMinor + discountMinor)}</span></div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Remise</span>
              {editing ? (
                <input type="number" min={0} step={0.1} value={discountDt} onChange={(e) => setDiscountDt(e.target.value)} className="input w-24 py-1 text-right text-xs" />
              ) : (
                <span className="font-bold">{formatMinor(sale.discountMinor)}</span>
              )}
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5 font-black text-slate-900"><span>Total</span><span>{formatMinor(totalMinor)}</span></div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Paiement</p>
            {editing ? (
              <div className="space-y-1.5">
                {payments.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select value={p.method} onChange={(e) => setPayments((prev) => prev.map((row, idx) => (idx === i ? { ...row, method: e.target.value as EditPayment['method'] } : row)))} className="input flex-1 py-2 text-xs">
                      {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    <input type="number" min={0} step={0.1} value={p.amountDt} onChange={(e) => setPayments((prev) => prev.map((row, idx) => (idx === i ? { ...row, amountDt: e.target.value } : row)))} className="input w-24 py-2 text-xs text-right" />
                    <button onClick={() => setPayments((prev) => prev.filter((_, idx) => idx !== i))} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-rose-500 hover:bg-rose-50">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <button onClick={() => setPayments((prev) => [...prev, { method: 'CASH', amountDt: '0' }])} className="btn-ghost w-full py-1.5 text-xs">+ Ajouter un paiement</button>
                {!paymentsBalanced && (
                  <p className="flex items-center gap-1.5 text-[11px] font-bold text-amber-600"><AlertTriangle size={12} /> Écart de {formatMinor(totalMinor - paymentsSum)} avec le total</p>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {sale.payments.map((p, i) => (
                  <div key={i} className="flex justify-between text-xs"><span className="text-slate-500">{PAYMENT_METHODS.find((m) => m.value === p.method)?.label ?? p.method}</span><span className="font-bold">{formatMinor(p.amountMinor)}</span></div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-black uppercase tracking-wider text-slate-400">Notes</p>
            {editing ? (
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input w-full text-xs" placeholder="Note interne (optionnel)" />
            ) : (
              <p className="text-xs text-slate-600">{sale.notes || '—'}</p>
            )}
          </div>

          {editing && (
            <div>
              <p className="mb-1.5 text-[11px] font-black uppercase tracking-wider text-slate-400">Motif de la modification <span className="text-rose-500">*</span></p>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="input w-full text-xs" placeholder="Requis — ex. erreur de quantité signalée par le client" />
            </div>
          )}

          {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</p>}
        </div>

        <div className="flex gap-2 border-t border-slate-200 p-4">
          {editing ? (
            <>
              <button onClick={() => { setEditing(false); setError(null); }} className="btn-ghost flex-1">Annuler</button>
              <button onClick={save} disabled={saving} className="btn-primary flex-1 disabled:opacity-40">{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
            </>
          ) : (
            <>
              <PrintMenu className="flex-1" onPick={(format) => onPrint(sale, format)} />
              {canEdit && sale.status === 'COMPLETED' && (
                <button onClick={() => setEditing(true)} className="btn-primary flex-1">Modifier</button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function toEditLines(lines: PosSaleLine[]): EditLine[] {
  return lines.map((l) => ({ variantId: l.variantId, name: l.descriptionSnapshot, sku: l.sku, qty: l.qty, unitPriceMinor: l.unitPriceMinor, discountMinor: l.discountMinor }));
}
