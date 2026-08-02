'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, Package, Plus, RefreshCw, Truck, X } from 'lucide-react';
import { useToast } from './Toast';

type TransferLine = {
  variantId: string;
  productId: string;
  productName: string;
  requestedQuantity: number;
  approvedQuantity: number | null;
  shippedQuantity: number | null;
  receivedQuantity: number;
  damagedQuantity: number;
  missingQuantity: number;
};

type Transfer = {
  id: string;
  transferNumber: string;
  sourceLocationId: string;
  destinationLocationId: string;
  status: string;
  lines: TransferLine[];
  note: string | null;
  createdAt: string;
};

type PickerProduct = { id: string; name: string; price: number; image: string | null };

const LOCATIONS = [
  { code: 'DEPOT', label: 'Dépôt' },
  { code: 'BOUTIQUE', label: 'Boutique' },
];

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Brouillon', REQUESTED: 'Demandé', APPROVED: 'Approuvé', PREPARING: 'Préparation',
  SHIPPED: 'Expédié', PARTIALLY_RECEIVED: 'Partiellement reçu', RECEIVED: 'Reçu',
  CANCELLED: 'Annulé', REJECTED: 'Rejeté',
};
const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-ink-200 text-ink-700', REQUESTED: 'bg-amber-100 text-amber-700', APPROVED: 'bg-blue-100 text-blue-700',
  PREPARING: 'bg-blue-100 text-blue-700', SHIPPED: 'bg-violet-100 text-violet-700',
  PARTIALLY_RECEIVED: 'bg-orange-100 text-orange-700', RECEIVED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-ink-200 text-ink-700', REJECTED: 'bg-red-100 text-red-700',
};

export default function TransfersView() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<Transfer | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/inventory/transfers', { cache: 'no-store' });
      setTransfers(res.ok ? await res.json() : []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);

  return (
    <div className="p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black">Transferts de stock</h1>
          <p className="text-ink-700">Dépôt ↔ Boutique — demande, approbation, expédition, réception.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="btn-ghost inline-flex items-center gap-2">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualiser
          </button>
          <button onClick={() => setCreating(true)} className="btn-primary inline-flex items-center gap-2">
            <Plus size={16} /> Nouveau transfert
          </button>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-100 text-xs font-black uppercase text-ink-700">
            <tr>
              <th className="px-4 py-3">N°</th>
              <th className="px-4 py-3">Trajet</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Lignes</th>
              <th className="px-4 py-3">Créé le</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((t) => (
              <tr key={t.id} className="border-t border-ink-200">
                <td className="px-4 py-3 font-bold text-brand-700">{t.transferNumber}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 font-bold text-ink-900">
                    {t.sourceLocationId} <ArrowRight size={13} className="text-ink-500" /> {t.destinationLocationId}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-black ${STATUS_COLOR[t.status] ?? 'bg-ink-200 text-ink-700'}`}>
                    {STATUS_LABEL[t.status] ?? t.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink-700">{t.lines.length}</td>
                <td className="px-4 py-3 text-ink-700">{new Date(t.createdAt).toLocaleString('fr-FR')}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setDetail(t)} className="btn-ghost px-3 py-1.5 text-xs">Ouvrir</button>
                </td>
              </tr>
            ))}
            {!transfers.length && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-ink-700">Aucun transfert.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <CreateTransferDrawer
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); refresh(); }}
        />
      )}

      {detail && (
        <TransferDetailDrawer
          transfer={detail}
          onClose={() => setDetail(null)}
          onChanged={(updated) => {
            setDetail(updated);
            setTransfers((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
          }}
        />
      )}
    </div>
  );
}

function CreateTransferDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [source, setSource] = useState('DEPOT');
  const [destination, setDestination] = useState('BOUTIQUE');
  const [products, setProducts] = useState<PickerProduct[]>([]);
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<{ productId: string; name: string; requestedQuantity: number }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/admin/products-picker').then((r) => r.json()).then((data) => setProducts(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  const filtered = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8);

  function addLine(p: PickerProduct) {
    if (lines.some((l) => l.productId === p.id)) return;
    setLines((prev) => [...prev, { productId: p.id, name: p.name, requestedQuantity: 1 }]);
    setSearch('');
  }

  async function submit() {
    if (source === destination) { toast.error('Source et destination doivent différer'); return; }
    if (!lines.length) { toast.error('Ajoutez au moins un produit'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/inventory/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceLocationId: source,
          destinationLocationId: destination,
          lines: lines.map((l) => ({ productId: l.productId, requestedQuantity: l.requestedQuantity })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error ?? 'Erreur'); return; }
      toast.success('Transfert demandé');
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-black text-ink-900">Nouveau transfert</h2>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100"><X size={18} /></button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <label className="block text-sm font-bold">Source
            <select className="input mt-1" value={source} onChange={(e) => setSource(e.target.value)}>
              {LOCATIONS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-bold">Destination
            <select className="input mt-1" value={destination} onChange={(e) => setDestination(e.target.value)}>
              {LOCATIONS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </label>
        </div>

        <label className="mb-2 block text-sm font-bold">Ajouter un produit
          <input className="input mt-1" placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        {search && (
          <div className="mb-4 max-h-40 overflow-y-auto rounded-xl border border-ink-200">
            {filtered.map((p) => (
              <button key={p.id} onClick={() => addLine(p)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-ink-100">
                <Package size={14} className="text-ink-500" /> {p.name}
              </button>
            ))}
            {!filtered.length && <p className="px-3 py-2 text-sm text-ink-500">Aucun résultat</p>}
          </div>
        )}

        <div className="mb-5 space-y-2">
          {lines.map((l) => (
            <div key={l.productId} className="flex items-center gap-2 rounded-xl bg-ink-100 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-bold">{l.name}</span>
              <input
                type="number" min={1} className="input w-20 py-1 text-center"
                value={l.requestedQuantity}
                onChange={(e) => setLines((prev) => prev.map((x) => (x.productId === l.productId ? { ...x, requestedQuantity: Math.max(1, Number(e.target.value)) } : x)))}
              />
              <button onClick={() => setLines((prev) => prev.filter((x) => x.productId !== l.productId))} className="text-ink-500 hover:text-red-600"><X size={16} /></button>
            </div>
          ))}
          {!lines.length && <p className="text-sm text-ink-500">Aucun produit ajouté.</p>}
        </div>

        <button disabled={busy} onClick={submit} className="btn-primary w-full disabled:opacity-40">
          {busy ? 'Envoi…' : 'Demander le transfert'}
        </button>
      </div>
    </div>
  );
}

function TransferDetailDrawer({ transfer, onClose, onChanged }: { transfer: Transfer; onClose: () => void; onChanged: (t: Transfer) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [approveQty, setApproveQty] = useState<Record<string, number>>(
    Object.fromEntries(transfer.lines.map((l) => [l.variantId, l.approvedQuantity ?? l.requestedQuantity])),
  );
  const [receiveQty, setReceiveQty] = useState<Record<string, { received: number; damaged: number; missing: number }>>(
    Object.fromEntries(transfer.lines.map((l) => [l.variantId, { received: Math.max(0, (l.shippedQuantity ?? 0) - l.receivedQuantity - l.damagedQuantity - l.missingQuantity), damaged: 0, missing: 0 }])),
  );

  async function call(path: string, body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/inventory/transfers/${transfer.id}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error ?? 'Erreur'); return; }
      toast.success('Transfert mis à jour');
      onChanged(data);
    } finally {
      setBusy(false);
    }
  }

  const remainingByLine = (l: TransferLine) => Math.max(0, (l.shippedQuantity ?? 0) - l.receivedQuantity - l.damagedQuantity - l.missingQuantity);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-ink-900">{transfer.transferNumber}</h2>
            <p className="text-sm text-ink-700">{transfer.sourceLocationId} → {transfer.destinationLocationId} · {STATUS_LABEL[transfer.status] ?? transfer.status}</p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100"><X size={18} /></button>
        </div>

        <div className="mb-5 space-y-2">
          {transfer.lines.map((l) => (
            <div key={l.variantId} className="rounded-xl bg-ink-100 p-3 text-sm">
              <p className="mb-1 font-bold text-ink-900">{l.productName}</p>
              <p className="text-xs text-ink-700">
                Demandé {l.requestedQuantity} · Approuvé {l.approvedQuantity ?? '—'} · Expédié {l.shippedQuantity ?? '—'} · Reçu {l.receivedQuantity}
                {(l.damagedQuantity > 0 || l.missingQuantity > 0) && <> · Endommagé {l.damagedQuantity} · Manquant {l.missingQuantity}</>}
              </p>

              {(transfer.status === 'REQUESTED' || transfer.status === 'DRAFT') && (
                <label className="mt-2 block text-xs font-bold">Quantité approuvée
                  <input
                    type="number" min={0} className="input mt-1 py-1"
                    value={approveQty[l.variantId] ?? 0}
                    onChange={(e) => setApproveQty((prev) => ({ ...prev, [l.variantId]: Math.max(0, Number(e.target.value)) }))}
                  />
                </label>
              )}

              {(transfer.status === 'SHIPPED' || transfer.status === 'PARTIALLY_RECEIVED') && remainingByLine(l) > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <label className="text-xs font-bold">Reçu
                    <input type="number" min={0} className="input mt-1 py-1" value={receiveQty[l.variantId]?.received ?? 0}
                      onChange={(e) => setReceiveQty((prev) => ({ ...prev, [l.variantId]: { ...prev[l.variantId], received: Math.max(0, Number(e.target.value)) } }))} />
                  </label>
                  <label className="text-xs font-bold">Endommagé
                    <input type="number" min={0} className="input mt-1 py-1" value={receiveQty[l.variantId]?.damaged ?? 0}
                      onChange={(e) => setReceiveQty((prev) => ({ ...prev, [l.variantId]: { ...prev[l.variantId], damaged: Math.max(0, Number(e.target.value)) } }))} />
                  </label>
                  <label className="text-xs font-bold">Manquant
                    <input type="number" min={0} className="input mt-1 py-1" value={receiveQty[l.variantId]?.missing ?? 0}
                      onChange={(e) => setReceiveQty((prev) => ({ ...prev, [l.variantId]: { ...prev[l.variantId], missing: Math.max(0, Number(e.target.value)) } }))} />
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {(transfer.status === 'REQUESTED' || transfer.status === 'DRAFT') && (
            <button disabled={busy} onClick={() => call('/approve', { lines: transfer.lines.map((l) => ({ variantId: l.variantId, approvedQuantity: approveQty[l.variantId] ?? 0 })) })} className="btn-primary flex-1 disabled:opacity-40">
              Approuver
            </button>
          )}
          {transfer.status === 'APPROVED' && (
            <button disabled={busy} onClick={() => call('/ship')} className="btn-primary flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-40">
              <Truck size={16} /> Expédier
            </button>
          )}
          {(transfer.status === 'SHIPPED' || transfer.status === 'PARTIALLY_RECEIVED') && (
            <button
              disabled={busy}
              onClick={() => call('/receive', {
                lines: transfer.lines
                  .filter((l) => remainingByLine(l) > 0)
                  .map((l) => ({ variantId: l.variantId, receivedQuantity: receiveQty[l.variantId]?.received ?? 0, damagedQuantity: receiveQty[l.variantId]?.damaged ?? 0, missingQuantity: receiveQty[l.variantId]?.missing ?? 0 })),
              })}
              className="btn-primary flex-1 disabled:opacity-40"
            >
              Réceptionner
            </button>
          )}
          {['DRAFT', 'REQUESTED', 'APPROVED', 'PREPARING'].includes(transfer.status) && (
            <button disabled={busy} onClick={() => call('/cancel')} className="btn-ghost text-red-600">Annuler</button>
          )}
        </div>
      </div>
    </div>
  );
}
