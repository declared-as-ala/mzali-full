'use client';
import { useEffect, useState } from 'react';
import { CreditCard, Download, FileArchive, Gift, Layers, Package, Printer, RefreshCw, Search, Settings2, ShieldOff, Users, X } from 'lucide-react';
import { useToast } from './Toast';

type Account = {
  id: string; customerId: string; customerName: string; customerPhone: string;
  cardNumber: string; pointsBalance: number; lifetimePointsEarned: number; lifetimePointsRedeemed: number;
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED'; joinedAt: string;
};
type Transaction = {
  id: string; type: string; pointsDelta: number; balanceBefore: number; balanceAfter: number;
  sourceType: string; sourceId: string | null; reason: string | null; createdAt: string;
};
type LoyaltySettings = {
  pointsPerDinarSpent: number; minimumPurchaseMinor: number; birthdayBonusPoints: number;
  newCustomerBonusPoints: number; excludeShippingFromEarning: boolean;
  pointValueMinor: number; maxRedemptionPercentOfSale: number; minimumPointsToRedeem: number;
  managerApprovalAboveMinor: number;
};

type CardBatch = {
  id: string; batchNumber: number; name: string; quantity: number;
  templateCode: 'STANDARD' | 'SILVER' | 'GOLD' | 'VIP'; templateVersion: number;
  generatedByName: string; generatedAt: string; exportedAt: string | null; printedAt: string | null;
  status: 'GENERATED' | 'EXPORTED' | 'PRINTED'; notes: string | null; virtual: boolean;
  assignedCount: number; unassignedCount: number; revokedCount: number; otherCount: number;
};

// Print-design choice for physical cards (not a customer "level") — see
// loyalty-card-design.ts on the backend for the matching palette.
const TEMPLATE_LABEL: Record<string, string> = { STANDARD: 'Fidélité', SILVER: 'Argent', GOLD: 'Or', VIP: 'VIP' };
const BATCH_STATUS_LABEL: Record<CardBatch['status'], string> = { GENERATED: 'Générée', EXPORTED: 'Exportée', PRINTED: 'Imprimée' };
const TAB_LABEL = { accounts: 'Comptes', batches: 'Lots de cartes', rules: 'Règles' } as const;

export default function LoyaltyView() {
  const [tab, setTab] = useState<keyof typeof TAB_LABEL>('accounts');

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-3xl font-black">Fidélité</h1>
        <p className="text-ink-700">Comptes de fidélité, cartes et règles de gain/échange de points.</p>
      </header>

      <div className="mb-6 flex gap-2 border-b border-ink-200">
        {(Object.keys(TAB_LABEL) as (keyof typeof TAB_LABEL)[]).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-black transition ${tab === key ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-900'}`}
          >
            {TAB_LABEL[key]}
          </button>
        ))}
      </div>

      {tab === 'accounts' && <AccountsTab />}
      {tab === 'batches' && <BatchesTab />}
      {tab === 'rules' && <RulesTab />}
    </div>
  );
}

function AccountsTab() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<Account | null>(null);

  async function refresh(q?: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/loyalty/accounts?search=${encodeURIComponent(q ?? search)}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      setAccounts(res.ok ? (data.items ?? []) : []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(''); }, []);

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
          <input
            className="input pl-10"
            placeholder="Rechercher (nom, téléphone, carte)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') refresh(); }}
          />
        </div>
        <button onClick={() => refresh()} className="btn-ghost inline-flex items-center gap-2">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualiser
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-100 text-xs font-black uppercase text-ink-700">
            <tr>
              <th className="px-4 py-3">Carte</th><th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Solde</th><th className="px-4 py-3">Statut</th><th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="border-t border-ink-200">
                <td className="px-4 py-3 font-bold text-brand-700">{a.cardNumber}</td>
                <td className="px-4 py-3 font-bold text-ink-900">{a.customerName || a.customerPhone}</td>
                <td className="px-4 py-3 font-bold">{a.pointsBalance} pts</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-black ${a.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {a.status === 'ACTIVE' ? 'Actif' : 'Suspendu'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right"><button onClick={() => setDetail(a)} className="btn-ghost px-3 py-1.5 text-xs">Ouvrir</button></td>
              </tr>
            ))}
            {!accounts.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-ink-700">Aucun compte de fidélité.</td></tr>}
          </tbody>
        </table>
      </div>

      {detail && <AccountDetailDrawer account={detail} onClose={() => setDetail(null)} onChanged={() => refresh()} toast={toast} />}
    </div>
  );
}

function AccountDetailDrawer({ account, onClose, onChanged, toast }: { account: Account; onClose: () => void; onChanged: () => void; toast: ReturnType<typeof useToast> }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [adjustPoints, setAdjustPoints] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadTransactions() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/loyalty/accounts/${account.id}/transactions`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      setTransactions(res.ok ? (data.items ?? []) : []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadTransactions(); }, [account.id]);

  async function suspend() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/loyalty/accounts/${account.id}/suspend`, { method: 'POST' });
      if (!res.ok) { toast.error('Erreur'); return; }
      toast.success('Compte suspendu');
      onChanged();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function adjust() {
    const points = Number(adjustPoints);
    if (!points || !adjustReason.trim()) { toast.error('Points et motif requis'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/loyalty/adjustments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: account.id, pointsDelta: points, reason: adjustReason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error ?? 'Erreur'); return; }
      toast.success('Ajustement enregistré');
      setAdjustPoints('');
      setAdjustReason('');
      loadTransactions();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-ink-900">{account.cardNumber}</h2>
            <p className="text-sm text-ink-700">{account.customerName || account.customerPhone}</p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100"><X size={18} /></button>
        </div>

        <div className="mb-5 grid grid-cols-3 gap-2 rounded-xl bg-ink-100 p-3 text-center">
          <div><p className="text-xl font-black text-brand-700">{account.pointsBalance}</p><p className="text-xs font-bold text-ink-700">Solde</p></div>
          <div><p className="text-xl font-black text-ink-900">{account.lifetimePointsEarned}</p><p className="text-xs font-bold text-ink-700">Gagnés (total)</p></div>
          <div><p className="text-xl font-black text-ink-900">{account.lifetimePointsRedeemed}</p><p className="text-xs font-bold text-ink-700">Échangés (total)</p></div>
        </div>

        {account.status === 'ACTIVE' && (
          <button disabled={busy} onClick={suspend} className="btn-ghost mb-5 inline-flex items-center gap-2 text-red-600 disabled:opacity-40">
            <ShieldOff size={14} /> Suspendre le compte
          </button>
        )}

        <div className="mb-5 rounded-xl bg-ink-100 p-3">
          <h3 className="mb-2 text-xs font-black uppercase text-ink-700">Ajustement manuel</h3>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" placeholder="Points (+/-)" className="input py-1.5" value={adjustPoints} onChange={(e) => setAdjustPoints(e.target.value)} />
            <input placeholder="Motif (requis)" className="input py-1.5" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
          </div>
          <button disabled={busy || !adjustPoints || !adjustReason.trim()} onClick={adjust} className="btn-primary mt-2 w-full disabled:opacity-40">
            Appliquer l'ajustement
          </button>
        </div>

        <h3 className="mb-2 text-xs font-black uppercase text-ink-700">Historique</h3>
        {loading ? (
          <p className="text-sm text-ink-500">Chargement…</p>
        ) : (
          <div className="space-y-2">
            {transactions.map((t) => (
              <div key={t.id} className="rounded-xl bg-ink-100 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink-900">{t.type}</span>
                  <span className={`font-black ${t.pointsDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{t.pointsDelta >= 0 ? '+' : ''}{t.pointsDelta}</span>
                </div>
                <p className="text-xs text-ink-700">{t.sourceType}{t.reason ? ` · ${t.reason}` : ''} · {new Date(t.createdAt).toLocaleString('fr-TN')}</p>
              </div>
            ))}
            {!transactions.length && <p className="text-sm text-ink-500">Aucune transaction.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function BatchesTab() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState<CardBatch[]>([]);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<CardBatch | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/loyalty/card-batches', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      setBatches(res.ok ? (data.items ?? data ?? []) : []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-ink-700">Génération, export et suivi des lots de cartes fidélité PVC.</p>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCreate(true)} className="btn-primary inline-flex items-center gap-2">
            <Layers size={14} /> Nouveau lot
          </button>
          <button onClick={refresh} className="btn-ghost inline-flex items-center gap-2">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualiser
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-100 text-xs font-black uppercase text-ink-700">
            <tr>
              <th className="px-4 py-3">Lot</th><th className="px-4 py-3">Modèle</th><th className="px-4 py-3">Quantité</th>
              <th className="px-4 py-3">Assignées</th><th className="px-4 py-3">Statut</th><th className="px-4 py-3">Générée par</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id} className="border-t border-ink-200">
                <td className="px-4 py-3 font-bold text-brand-700">#{b.batchNumber} — {b.name}</td>
                <td className="px-4 py-3 text-ink-700">{TEMPLATE_LABEL[b.templateCode] ?? b.templateCode}</td>
                <td className="px-4 py-3 font-bold">{b.quantity}</td>
                <td className="px-4 py-3 text-ink-700">{b.assignedCount} / {b.quantity}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-black ${b.status === 'PRINTED' ? 'bg-emerald-100 text-emerald-700' : b.status === 'EXPORTED' ? 'bg-sky-100 text-sky-700' : 'bg-ink-200 text-ink-700'}`}>
                    {BATCH_STATUS_LABEL[b.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink-700">{b.generatedByName}</td>
                <td className="px-4 py-3 text-right"><button onClick={() => setDetail(b)} className="btn-ghost px-3 py-1.5 text-xs">Ouvrir</button></td>
              </tr>
            ))}
            {!batches.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-ink-700">Aucun lot de cartes.</td></tr>}
          </tbody>
        </table>
      </div>

      {showCreate && <CreateBatchModal onClose={() => setShowCreate(false)} onCreated={() => { refresh(); setShowCreate(false); }} creating={creating} setCreating={setCreating} toast={toast} />}
      {detail && <BatchDetailDrawer batch={detail} onClose={() => setDetail(null)} onChanged={refresh} toast={toast} />}
    </div>
  );
}

function CreateBatchModal({ onClose, onCreated, creating, setCreating, toast }: {
  onClose: () => void; onCreated: () => void; creating: boolean; setCreating: (v: boolean) => void; toast: ReturnType<typeof useToast>;
}) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('50');
  const [templateCode, setTemplateCode] = useState<CardBatch['templateCode']>('STANDARD');
  const [notes, setNotes] = useState('');

  async function submit() {
    const qty = Number(quantity);
    if (!name.trim() || !qty || qty < 1 || qty > 2000) { toast.error('Nom et quantité (1–2000) requis'); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/admin/loyalty/card-batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ name: name.trim(), quantity: qty, templateCode, notes: notes.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error ?? 'Erreur'); return; }
      toast.success('Lot généré');
      onCreated();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black text-ink-900">Nouveau lot de cartes</h2>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <label className="block text-sm font-bold">Nom du lot
            <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Lot boutique — juillet 2026" />
          </label>
          <label className="block text-sm font-bold">Quantité (1–2000)
            <input type="number" min={1} max={2000} className="input mt-1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
          <label className="block text-sm font-bold">Modèle
            <select className="input mt-1" value={templateCode} onChange={(e) => setTemplateCode(e.target.value as CardBatch['templateCode'])}>
              {(['STANDARD', 'SILVER', 'GOLD', 'VIP'] as const).map((c) => <option key={c} value={c}>{TEMPLATE_LABEL[c]}</option>)}
            </select>
          </label>
          <label className="block text-sm font-bold">Notes (optionnelles)
            <textarea className="input mt-1 min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        <button disabled={creating} onClick={submit} className="btn-primary mt-4 w-full disabled:opacity-40">
          {creating ? 'Génération…' : 'Générer le lot'}
        </button>
      </div>
    </div>
  );
}

const PREVIEW_MODE_LABEL = { front: 'Recto', back: 'Verso', print: 'Impression', sheet: 'Planche' } as const;
type PreviewMode = keyof typeof PREVIEW_MODE_LABEL;

function BatchDetailDrawer({ batch, onClose, onChanged, toast }: { batch: CardBatch; onClose: () => void; onChanged: () => void; toast: ReturnType<typeof useToast> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('front');
  const [firstCardId, setFirstCardId] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/loyalty/card-batches/${batch.id}/cards`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((cards) => setFirstCardId(Array.isArray(cards) && cards.length ? cards[0].id : null))
      .finally(() => setLoadingPreview(false));
  }, [batch.id]);

  async function action(path: string, label: string, body?: unknown) {
    setBusy(path);
    try {
      const res = await fetch(`/api/admin/loyalty/card-batches/${batch.id}/${path}`, {
        method: 'POST', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error ?? 'Erreur'); return; }
      toast.success(label);
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  async function exportMode(mode: 'pvc' | 'sheet' | 'zip') {
    setBusy(`export-${mode}`);
    try {
      const res = await fetch(`/api/admin/loyalty/card-batches/${batch.id}/export/${mode}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error ?? "Échec de l'export"); return; }
      for (const url of Object.values(data)) window.open(String(url), '_blank');
      toast.success('Export généré');
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-ink-900">#{batch.batchNumber} — {batch.name}</h2>
            <p className="text-sm text-ink-700">{TEMPLATE_LABEL[batch.templateCode]} · {batch.quantity} cartes · {BATCH_STATUS_LABEL[batch.status]}</p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100"><X size={18} /></button>
        </div>

        <div className="mb-5 grid grid-cols-4 gap-2 rounded-xl bg-ink-100 p-3 text-center">
          <div><p className="text-lg font-black text-brand-700">{batch.assignedCount}</p><p className="text-[11px] font-bold text-ink-700">Assignées</p></div>
          <div><p className="text-lg font-black text-ink-900">{batch.unassignedCount}</p><p className="text-[11px] font-bold text-ink-700">Non assignées</p></div>
          <div><p className="text-lg font-black text-ink-900">{batch.revokedCount}</p><p className="text-[11px] font-bold text-ink-700">Révoquées</p></div>
          <div><p className="text-lg font-black text-ink-900">{batch.otherCount}</p><p className="text-[11px] font-bold text-ink-700">Autres</p></div>
        </div>

        {batch.notes && <p className="mb-5 rounded-xl bg-ink-100 p-3 text-sm text-ink-700">{batch.notes}</p>}

        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-black uppercase text-ink-700">Aperçu</h3>
            <div className="inline-flex rounded-lg border border-ink-200 bg-white p-0.5 text-xs font-bold">
              {(Object.keys(PREVIEW_MODE_LABEL) as PreviewMode[]).map((m) => (
                <button key={m} onClick={() => setPreviewMode(m)} className={`rounded-md px-2.5 py-1 ${previewMode === m ? 'bg-brand-500 text-white' : 'text-ink-700'}`}>
                  {PREVIEW_MODE_LABEL[m]}
                </button>
              ))}
            </div>
          </div>
          {loadingPreview ? (
            <div className="h-40 animate-pulse rounded-xl bg-ink-100" />
          ) : !firstCardId ? (
            <p className="text-sm text-ink-500">Aucune carte dans ce lot pour l&apos;aperçu.</p>
          ) : previewMode === 'front' ? (
            <img src={`/api/admin/loyalty/cards/${firstCardId}/preview/front.png`} alt="Aperçu recto" className="w-full rounded-xl border border-ink-200" />
          ) : previewMode === 'back' ? (
            <img src={`/api/admin/loyalty/cards/${firstCardId}/preview/back.png`} alt="Aperçu verso" className="w-full rounded-xl border border-ink-200" />
          ) : previewMode === 'print' ? (
            <iframe src={`/api/admin/loyalty/cards/${firstCardId}/preview/print.pdf`} className="h-72 w-full rounded-xl border border-ink-200" title="Aperçu impression" />
          ) : (
            <iframe src={`/api/admin/loyalty/card-batches/${batch.id}/preview/sheet.pdf`} className="h-72 w-full rounded-xl border border-ink-200" title="Aperçu planche" />
          )}
          <p className="mt-1.5 text-[11px] text-ink-500">Aperçu en lecture seule — n&apos;affecte pas le statut du lot.</p>
        </div>

        <div className="mb-5">
          <h3 className="mb-2 text-xs font-black uppercase text-ink-700">Exporter</h3>
          <div className="grid grid-cols-3 gap-2">
            <button disabled={busy === 'export-pvc'} onClick={() => exportMode('pvc')} className="btn-ghost flex-col gap-1 py-3 text-xs disabled:opacity-40">
              <CreditCard size={16} /> Imprimante PVC
            </button>
            <button disabled={busy === 'export-sheet'} onClick={() => exportMode('sheet')} className="btn-ghost flex-col gap-1 py-3 text-xs disabled:opacity-40">
              <Printer size={16} /> Planches A4
            </button>
            <button disabled={busy === 'export-zip'} onClick={() => exportMode('zip')} className="btn-ghost flex-col gap-1 py-3 text-xs disabled:opacity-40">
              <FileArchive size={16} /> Paquet ZIP
            </button>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          {batch.status === 'GENERATED' && (
            <button disabled={busy === 'mark-exported'} onClick={() => action('mark-exported', 'Lot marqué exporté')} className="btn-ghost inline-flex items-center gap-1.5 text-xs disabled:opacity-40">
              <Download size={13} /> Marquer exporté
            </button>
          )}
          {batch.status !== 'PRINTED' && (
            <button disabled={busy === 'mark-printed'} onClick={() => action('mark-printed', 'Lot marqué imprimé')} className="btn-ghost inline-flex items-center gap-1.5 text-xs disabled:opacity-40">
              <Package size={13} /> Marquer imprimé
            </button>
          )}
          {batch.unassignedCount > 0 && (
            <button
              disabled={busy === 'revoke-unassigned'}
              onClick={() => { if (confirm(`Révoquer les ${batch.unassignedCount} cartes non assignées de ce lot ?`)) action('revoke-unassigned', 'Cartes non assignées révoquées', { reason: 'Révocation manuelle depuis le lot' }); }}
              className="btn-ghost inline-flex items-center gap-1.5 text-xs text-red-600 disabled:opacity-40"
            >
              <ShieldOff size={13} /> Révoquer les non assignées
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RulesTab() {
  const toast = useToast();
  const [settings, setSettings] = useState<LoyaltySettings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/admin/settings/loyalty', { cache: 'no-store' }).then((r) => r.json()).then(setSettings).catch(() => {});
  }, []);

  async function save() {
    if (!settings) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/settings/loyalty', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings),
      });
      if (!res.ok) { toast.error('Erreur'); return; }
      toast.success('Règles de fidélité enregistrées');
    } finally {
      setBusy(false);
    }
  }

  if (!settings) return <p className="text-ink-700">Chargement…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-card">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-black text-ink-900"><Gift size={18} /> Gain de points</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-bold">Points par dinar dépensé
            <input type="number" min={0} step={0.1} className="input mt-1" value={settings.pointsPerDinarSpent} onChange={(e) => setSettings({ ...settings, pointsPerDinarSpent: Number(e.target.value) })} />
          </label>
          <label className="block text-sm font-bold">Achat minimum (DT)
            <input type="number" min={0} step={0.1} className="input mt-1" value={settings.minimumPurchaseMinor / 1000} onChange={(e) => setSettings({ ...settings, minimumPurchaseMinor: Math.round(Number(e.target.value) * 1000) })} />
          </label>
          <label className="block text-sm font-bold">Bonus nouveau client (points)
            <input type="number" min={0} className="input mt-1" value={settings.newCustomerBonusPoints} onChange={(e) => setSettings({ ...settings, newCustomerBonusPoints: Number(e.target.value) })} />
          </label>
          <label className="block text-sm font-bold">Bonus anniversaire (points)
            <input type="number" min={0} className="input mt-1" value={settings.birthdayBonusPoints} onChange={(e) => setSettings({ ...settings, birthdayBonusPoints: Number(e.target.value) })} />
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={settings.excludeShippingFromEarning} onChange={(e) => setSettings({ ...settings, excludeShippingFromEarning: e.target.checked })} />
          Exclure les frais de livraison du calcul des points
        </label>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-card">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-black text-ink-900"><Settings2 size={18} /> Échange de points</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-bold">Valeur d'un point (millimes)
            <input type="number" min={1} className="input mt-1" value={settings.pointValueMinor} onChange={(e) => setSettings({ ...settings, pointValueMinor: Number(e.target.value) })} />
          </label>
          <label className="block text-sm font-bold">Points minimum pour échanger
            <input type="number" min={0} className="input mt-1" value={settings.minimumPointsToRedeem} onChange={(e) => setSettings({ ...settings, minimumPointsToRedeem: Number(e.target.value) })} />
          </label>
          <label className="block text-sm font-bold">Remise max (% du montant de la vente)
            <input type="number" min={0} max={100} className="input mt-1" value={settings.maxRedemptionPercentOfSale} onChange={(e) => setSettings({ ...settings, maxRedemptionPercentOfSale: Number(e.target.value) })} />
          </label>
          <label className="block text-sm font-bold">Approbation responsable au-delà de (DT)
            <input type="number" min={0} step={0.1} className="input mt-1" value={settings.managerApprovalAboveMinor / 1000} onChange={(e) => setSettings({ ...settings, managerApprovalAboveMinor: Math.round(Number(e.target.value) * 1000) })} />
          </label>
        </div>
      </div>

      <button disabled={busy} onClick={save} className="btn-primary inline-flex items-center gap-2 disabled:opacity-40">
        <Users size={14} /> Enregistrer les règles
      </button>
    </div>
  );
}
