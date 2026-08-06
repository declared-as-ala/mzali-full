'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardList, EyeOff, Plus, RefreshCw, X } from 'lucide-react';
import { useToast } from './Toast';
import { formatDateTime } from '@/lib/site-config';

type StocktakeLine = {
  variantId: string;
  productId: string;
  productName: string;
  expectedQuantity?: number;
  countedQuantity: number | null;
  difference: number | null;
  reasonIfLarge: string | null;
};

type Stocktake = {
  id: string;
  stocktakeNumber: string;
  locationId: string;
  status: string;
  scope: { kind: string; categoryIds: string[] };
  blindCount: boolean;
  lines: StocktakeLine[];
  postedAt: string | null;
  createdAt: string;
};

type Category = { id: string; name: string };

const LOCATIONS = [
  { code: 'DEPOT', label: 'Dépôt' },
  { code: 'BOUTIQUE', label: 'Boutique' },
];

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Brouillon', IN_PROGRESS: 'En cours', COUNTED: 'Compté', REVIEW_REQUIRED: 'Révision requise',
  APPROVED: 'Approuvé', POSTED: 'Validé', CANCELLED: 'Annulé',
};
const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-ink-200 text-ink-700', IN_PROGRESS: 'bg-blue-100 text-blue-700', COUNTED: 'bg-amber-100 text-amber-700',
  REVIEW_REQUIRED: 'bg-orange-100 text-orange-700', APPROVED: 'bg-violet-100 text-violet-700',
  POSTED: 'bg-emerald-100 text-emerald-700', CANCELLED: 'bg-ink-200 text-ink-700',
};

export default function StocktakesView() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [stocktakes, setStocktakes] = useState<Stocktake[]>([]);
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/inventory/stocktakes', { cache: 'no-store' });
      setStocktakes(res.ok ? await res.json() : []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);

  return (
    <div className="p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black">Inventaires (comptage)</h1>
          <p className="text-ink-700">Comptage physique, écarts, correction du stock.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="btn-ghost inline-flex items-center gap-2">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualiser
          </button>
          <button onClick={() => setCreating(true)} className="btn-primary inline-flex items-center gap-2">
            <Plus size={16} /> Nouvel inventaire
          </button>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-100 text-xs font-black uppercase text-ink-700">
            <tr>
              <th className="px-4 py-3">N°</th>
              <th className="px-4 py-3">Emplacement</th>
              <th className="px-4 py-3">Périmètre</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Créé le</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {stocktakes.map((s) => (
              <tr key={s.id} className="border-t border-ink-200">
                <td className="px-4 py-3 font-bold text-brand-700">{s.stocktakeNumber}</td>
                <td className="px-4 py-3 font-bold text-ink-900">{s.locationId}</td>
                <td className="px-4 py-3 text-ink-700">
                  {s.scope.kind === 'all' ? 'Tout' : `${s.scope.categoryIds.length} catégorie(s)`}
                  {s.blindCount && <span className="ml-2 inline-flex items-center gap-1 text-xs text-ink-500"><EyeOff size={12} /> aveugle</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-black ${STATUS_COLOR[s.status] ?? 'bg-ink-200 text-ink-700'}`}>
                    {STATUS_LABEL[s.status] ?? s.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink-700">{formatDateTime(s.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setDetailId(s.id)} className="btn-ghost px-3 py-1.5 text-xs">Ouvrir</button>
                </td>
              </tr>
            ))}
            {!stocktakes.length && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-ink-700">Aucun inventaire.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <CreateStocktakeDrawer onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); refresh(); setDetailId(id); }} />
      )}

      {detailId && (
        <StocktakeDetailDrawer
          id={detailId}
          onClose={() => setDetailId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

function CreateStocktakeDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const [locationId, setLocationId] = useState('BOUTIQUE');
  const [scopeKind, setScopeKind] = useState<'all' | 'categories'>('all');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [blindCount, setBlindCount] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/admin/categories').then((r) => r.json()).then((data) => setCategories(Array.isArray(data) ? data : (data.items ?? []))).catch(() => {});
  }, []);

  async function submit() {
    if (scopeKind === 'categories' && !categoryIds.length) { toast.error('Sélectionnez au moins une catégorie'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/inventory/stocktakes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId, scopeKind, categoryIds: scopeKind === 'categories' ? categoryIds : undefined, blindCount }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error ?? 'Erreur'); return; }
      toast.success('Inventaire démarré');
      onCreated(data.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-black text-ink-900">Nouvel inventaire</h2>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100"><X size={18} /></button>
        </div>

        <label className="mb-4 block text-sm font-bold">Emplacement
          <select className="input mt-1" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {LOCATIONS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </label>

        <label className="mb-2 block text-sm font-bold">Périmètre</label>
        <div className="mb-4 flex gap-2">
          <button type="button" onClick={() => setScopeKind('all')} className={`flex-1 rounded-xl border-2 px-3 py-2 text-sm font-bold ${scopeKind === 'all' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-200'}`}>Tout le catalogue</button>
          <button type="button" onClick={() => setScopeKind('categories')} className={`flex-1 rounded-xl border-2 px-3 py-2 text-sm font-bold ${scopeKind === 'categories' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-200'}`}>Catégories</button>
        </div>

        {scopeKind === 'categories' && (
          <div className="mb-4 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-ink-200 p-2">
            {categories.map((c) => (
              <label key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-ink-100">
                <input
                  type="checkbox" checked={categoryIds.includes(c.id)}
                  onChange={(e) => setCategoryIds((prev) => (e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)))}
                />
                {c.name}
              </label>
            ))}
            {!categories.length && <p className="px-2 py-1 text-sm text-ink-500">Chargement…</p>}
          </div>
        )}

        <label className="mb-5 flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={blindCount} onChange={(e) => setBlindCount(e.target.checked)} />
          Comptage aveugle (masque la quantité système au compteur)
        </label>

        <button disabled={busy} onClick={submit} className="btn-primary w-full disabled:opacity-40">
          {busy ? 'Démarrage…' : "Démarrer l'inventaire"}
        </button>
      </div>
    </div>
  );
}

function StocktakeDetailDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [doc, setDoc] = useState<Stocktake | null>(null);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<Record<string, { countedQuantity: string; reasonIfLarge: string }>>({});

  async function load() {
    const res = await fetch(`/api/admin/inventory/stocktakes/${id}/count-sheet`, { cache: 'no-store' });
    if (!res.ok) return;
    const data: Stocktake = await res.json();
    setDoc(data);
    setCounts((prev) => {
      const next = { ...prev };
      for (const line of data.lines) {
        if (!next[line.variantId]) {
          next[line.variantId] = { countedQuantity: line.countedQuantity !== null ? String(line.countedQuantity) : '', reasonIfLarge: line.reasonIfLarge ?? '' };
        }
      }
      return next;
    });
  }
  useEffect(() => { load(); }, [id]);

  async function submitCount() {
    if (!doc) return;
    const lines = doc.lines
      .filter((l) => counts[l.variantId]?.countedQuantity !== '')
      .map((l) => ({
        variantId: l.variantId,
        countedQuantity: Number(counts[l.variantId]?.countedQuantity ?? 0),
        reasonIfLarge: counts[l.variantId]?.reasonIfLarge || undefined,
      }));
    if (!lines.length) { toast.error('Saisissez au moins une quantité comptée'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/inventory/stocktakes/${id}/count`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error ?? 'Erreur'); return; }
      toast.success('Comptage enregistré');
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function action(path: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/inventory/stocktakes/${id}${path}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error ?? 'Erreur'); return; }
      toast.success('Mis à jour');
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (!doc) return null;
  const canCount = doc.status === 'IN_PROGRESS' || doc.status === 'REVIEW_REQUIRED';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-ink-900">{doc.stocktakeNumber}</h2>
            <p className="text-sm text-ink-700">{doc.locationId} · {STATUS_LABEL[doc.status] ?? doc.status}</p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100"><X size={18} /></button>
        </div>

        <div className="mb-5 space-y-2">
          {doc.lines.map((l) => {
            const diffLarge = l.difference !== null && Math.abs(l.difference) > 0 && l.reasonIfLarge === null && !canCount;
            return (
              <div key={l.variantId} className="rounded-xl bg-ink-100 p-3 text-sm">
                <p className="mb-1 font-bold text-ink-900">{l.productName}</p>
                {l.expectedQuantity !== undefined && <p className="text-xs text-ink-700">Système : {l.expectedQuantity}</p>}
                {canCount ? (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="text-xs font-bold">Compté
                      <input
                        type="number" min={0} className="input mt-1 py-1"
                        value={counts[l.variantId]?.countedQuantity ?? ''}
                        onChange={(e) => setCounts((prev) => ({ ...prev, [l.variantId]: { ...prev[l.variantId], countedQuantity: e.target.value } }))}
                      />
                    </label>
                    <label className="text-xs font-bold">Motif (si écart important)
                      <input
                        className="input mt-1 py-1"
                        value={counts[l.variantId]?.reasonIfLarge ?? ''}
                        onChange={(e) => setCounts((prev) => ({ ...prev, [l.variantId]: { ...prev[l.variantId], reasonIfLarge: e.target.value } }))}
                      />
                    </label>
                  </div>
                ) : (
                  <p className="mt-1 text-xs font-black text-ink-900">
                    Compté : {l.countedQuantity ?? '—'} {l.difference !== null && <span className={l.difference === 0 ? 'text-emerald-700' : 'text-rose-700'}>({l.difference >= 0 ? '+' : ''}{l.difference})</span>}
                    {l.reasonIfLarge && <span className="ml-2 font-semibold text-ink-700">— {l.reasonIfLarge}</span>}
                  </p>
                )}
                {diffLarge && <p className="mt-1 text-xs font-bold text-rose-700">Motif requis avant validation</p>}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          {canCount && (
            <button disabled={busy} onClick={submitCount} className="btn-primary flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-40">
              <ClipboardList size={16} /> Enregistrer le comptage
            </button>
          )}
          {(doc.status === 'COUNTED' || doc.status === 'REVIEW_REQUIRED') && (
            <button disabled={busy} onClick={() => action('/approve')} className="btn-primary flex-1 disabled:opacity-40">Approuver</button>
          )}
          {doc.status === 'APPROVED' && (
            <button disabled={busy} onClick={() => action('/post')} className="btn-primary flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-40">
              <CheckCircle2 size={16} /> Valider (corrige le stock)
            </button>
          )}
          {doc.status !== 'POSTED' && doc.status !== 'CANCELLED' && (
            <button disabled={busy} onClick={() => action('/cancel')} className="btn-ghost text-red-600">Annuler</button>
          )}
        </div>
      </div>
    </div>
  );
}
