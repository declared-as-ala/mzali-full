'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, Search, ShieldAlert, ShieldOff, UserPlus, X } from 'lucide-react';
import { useToast } from './Toast';
import { formatDateTime } from '@/lib/site-config';

type CardHistoryEvent = { event: string; at: string; byName: string | null; note: string | null };
type LoyaltyCard = {
  id: string; cardNumber: string; qrToken: string; barcodeValue: string;
  batchId: string | null; batchName: string | null; templateCode: string;
  status: 'UNASSIGNED' | 'ACTIVE' | 'SUSPENDED' | 'LOST' | 'REPLACED' | 'REVOKED';
  accountId: string | null; customerId: string | null; customerName: string | null; customerPhone: string | null;
  assignedAt: string | null; replacesCardId: string | null; replacedByCardId: string | null;
  revokedAt: string | null; revokedReason: string | null; history: CardHistoryEvent[]; createdAt: string;
};

const STATUS_LABEL: Record<LoyaltyCard['status'], string> = {
  UNASSIGNED: 'Non assignée', ACTIVE: 'Active', SUSPENDED: 'Suspendue', LOST: 'Perdue', REPLACED: 'Remplacée', REVOKED: 'Révoquée',
};
const STATUS_STYLE: Record<LoyaltyCard['status'], string> = {
  UNASSIGNED: 'bg-ink-200 text-ink-700', ACTIVE: 'bg-emerald-100 text-emerald-700', SUSPENDED: 'bg-amber-100 text-amber-700',
  LOST: 'bg-rose-100 text-rose-700', REPLACED: 'bg-sky-100 text-sky-700', REVOKED: 'bg-ink-300 text-ink-800',
};

export default function LoyaltyCardsView() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<LoyaltyCard[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [detail, setDetail] = useState<LoyaltyCard | null>(null);
  const [showAssign, setShowAssign] = useState(false);

  async function refresh(nextPage = page) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), perPage: '30' });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      const res = await fetch(`/api/admin/loyalty/cards?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      setCards(res.ok ? (data.items ?? []) : []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
      setPage(nextPage);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(1); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">Cartes fidélité</h1>
          <p className="text-ink-700">Recherche, assignation, suspension et remplacement des cartes PVC ({total} carte{total > 1 ? 's' : ''}).</p>
        </div>
        <button onClick={() => setShowAssign(true)} className="btn-primary inline-flex items-center gap-2">
          <UserPlus size={14} /> Assigner une carte
        </button>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
          <input
            className="input pl-10"
            placeholder="Rechercher (numéro de carte, téléphone)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') refresh(1); }}
          />
        </div>
        <select className="input w-auto py-2.5" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          {(Object.keys(STATUS_LABEL) as LoyaltyCard['status'][]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <button onClick={() => refresh(1)} className="btn-ghost inline-flex items-center gap-2">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Rechercher
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-100 text-xs font-black uppercase text-ink-700">
            <tr>
              <th className="px-4 py-3">Carte</th><th className="px-4 py-3">Lot</th><th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Statut</th><th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => (
              <tr key={c.id} className="border-t border-ink-200">
                <td className="px-4 py-3 font-bold text-brand-700">{c.cardNumber}</td>
                <td className="px-4 py-3 text-ink-700">{c.batchName ?? '—'}</td>
                <td className="px-4 py-3 font-bold text-ink-900">{c.customerName || c.customerPhone || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-black ${STATUS_STYLE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                </td>
                <td className="px-4 py-3 text-right"><button onClick={() => setDetail(c)} className="btn-ghost px-3 py-1.5 text-xs">Ouvrir</button></td>
              </tr>
            ))}
            {!cards.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-ink-700">Aucune carte.</td></tr>}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => refresh(page - 1)} className="btn-ghost px-3 py-1.5 text-xs disabled:opacity-40">Précédent</button>
          <span className="text-xs font-bold text-ink-700">Page {page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => refresh(page + 1)} className="btn-ghost px-3 py-1.5 text-xs disabled:opacity-40">Suivant</button>
        </div>
      )}

      {detail && <CardDetailDrawer card={detail} onClose={() => setDetail(null)} onChanged={() => refresh()} toast={toast} />}
      {showAssign && <AssignCardModal onClose={() => setShowAssign(false)} onAssigned={() => { refresh(); setShowAssign(false); }} toast={toast} />}
    </div>
  );
}

function CardDetailDrawer({ card, onClose, onChanged, toast }: { card: LoyaltyCard; onClose: () => void; onChanged: () => void; toast: ReturnType<typeof useToast> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [showReplace, setShowReplace] = useState(false);

  async function action(path: string, label: string, body?: unknown) {
    setBusy(path);
    try {
      const res = await fetch(`/api/admin/loyalty/cards/${card.id}/${path}`, {
        method: 'POST', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error ?? 'Erreur'); return; }
      toast.success(label);
      onChanged();
      onClose();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-ink-900">{card.cardNumber}</h2>
            <p className="text-sm text-ink-700">{card.customerName || card.customerPhone || 'Non assignée'}</p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100"><X size={18} /></button>
        </div>

        <span className={`mb-3 inline-block rounded-full px-2.5 py-1 text-xs font-black ${STATUS_STYLE[card.status]}`}>{STATUS_LABEL[card.status]}</span>

        <div className="mb-5 grid grid-cols-2 gap-2">
          <div>
            <img src={`/api/admin/loyalty/cards/${card.id}/preview/front.png`} alt="Recto" className="w-full rounded-lg border border-ink-200" />
            <p className="mt-1 text-center text-[10px] font-bold uppercase text-ink-500">Recto</p>
          </div>
          <div>
            <img src={`/api/admin/loyalty/cards/${card.id}/preview/back.png`} alt="Verso" className="w-full rounded-lg border border-ink-200" />
            <p className="mt-1 text-center text-[10px] font-bold uppercase text-ink-500">Verso</p>
          </div>
        </div>

        {card.status === 'ACTIVE' && (
          <div className="mb-5 space-y-2">
            <label className="block text-xs font-bold text-ink-700">Motif (pour suspension / révocation)
              <input className="input mt-1 py-1.5" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motif" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy === 'suspend'} onClick={() => action('suspend', 'Carte suspendue', { reason: reason.trim() || undefined })} className="btn-ghost inline-flex items-center gap-1.5 text-xs text-amber-700 disabled:opacity-40">
                <ShieldAlert size={13} /> Suspendre
              </button>
              <button disabled={busy === 'mark-lost'} onClick={() => { if (confirm('Marquer cette carte comme perdue ? Les points du compte sont conservés.')) action('mark-lost', 'Carte marquée perdue', { reason: reason.trim() || undefined }); }} className="btn-ghost inline-flex items-center gap-1.5 text-xs text-rose-700 disabled:opacity-40">
                <ShieldOff size={13} /> Marquer perdue
              </button>
              <button disabled={busy === 'revoke'} onClick={() => { if (confirm('Révoquer définitivement cette carte ?')) action('revoke', 'Carte révoquée', { reason: reason.trim() || undefined }); }} className="btn-ghost inline-flex items-center gap-1.5 text-xs text-rose-700 disabled:opacity-40">
                <ShieldOff size={13} /> Révoquer
              </button>
              <button onClick={() => setShowReplace(true)} className="btn-primary inline-flex items-center gap-1.5 text-xs">
                Remplacer
              </button>
            </div>
          </div>
        )}

        {card.status === 'SUSPENDED' && (
          <button disabled={busy === 'reactivate'} onClick={() => action('reactivate', 'Carte réactivée')} className="btn-primary mb-5 inline-flex items-center gap-2 disabled:opacity-40">
            <CheckCircle2 size={14} /> Réactiver
          </button>
        )}

        {(card.status === 'LOST') && (
          <button onClick={() => setShowReplace(true)} className="btn-primary mb-5 inline-flex items-center gap-2">
            Remplacer (points conservés)
          </button>
        )}

        {card.revokedReason && <p className="mb-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">Motif : {card.revokedReason}</p>}

        <h3 className="mb-2 text-xs font-black uppercase text-ink-700">Historique</h3>
        <ul className="space-y-2">
          {card.history.map((h, i) => (
            <li key={i} className="rounded-xl bg-ink-100 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-bold text-ink-900">{h.event}</span>
                <span className="text-xs text-ink-500">{formatDateTime(h.at)}</span>
              </div>
              <p className="text-xs text-ink-700">{h.byName ?? 'Système'}{h.note ? ` · ${h.note}` : ''}</p>
            </li>
          ))}
          {!card.history.length && <p className="text-sm text-ink-500">Aucun historique.</p>}
        </ul>

        {showReplace && (
          <ReplaceCardModal cardId={card.id} onClose={() => setShowReplace(false)} onReplaced={() => { onChanged(); onClose(); }} toast={toast} />
        )}
      </div>
    </div>
  );
}

function ReplaceCardModal({ cardId, onClose, onReplaced, toast }: { cardId: string; onClose: () => void; onReplaced: () => void; toast: ReturnType<typeof useToast> }) {
  const [newCardNumber, setNewCardNumber] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!reason.trim()) { toast.error('Le motif est requis'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/loyalty/cards/replace', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldCardId: cardId, newCardNumber: newCardNumber.trim() || undefined, reason: reason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error ?? 'Erreur'); return; }
      toast.success('Carte remplacée — solde de points conservé');
      onReplaced();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black text-ink-900">Remplacer la carte</h2>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100"><X size={18} /></button>
        </div>
        <p className="mb-3 text-sm text-ink-700">Le solde de points et l&apos;historique du compte sont conservés sur la nouvelle carte.</p>
        <div className="space-y-3">
          <label className="block text-sm font-bold">Nouvelle carte (numéro, optionnel — sinon prise dans un lot non assigné)
            <input className="input mt-1" value={newCardNumber} onChange={(e) => setNewCardNumber(e.target.value)} placeholder="Numéro de carte" />
          </label>
          <label className="block text-sm font-bold">Motif (requis)
            <input className="input mt-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Carte perdue, endommagée..." />
          </label>
        </div>
        <button disabled={busy} onClick={submit} className="btn-primary mt-4 w-full disabled:opacity-40">
          {busy ? 'Remplacement…' : 'Confirmer le remplacement'}
        </button>
      </div>
    </div>
  );
}

function AssignCardModal({ onClose, onAssigned, toast }: { onClose: () => void; onAssigned: () => void; toast: ReturnType<typeof useToast> }) {
  const [cardNumber, setCardNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!cardNumber.trim() || !phone.trim()) { toast.error('Numéro de carte et téléphone requis'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/loyalty/cards/assign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardNumber: cardNumber.trim(), phone: phone.trim(), firstName: firstName.trim() || undefined, lastName: lastName.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error ?? 'Erreur'); return; }
      toast.success('Carte assignée');
      onAssigned();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black text-ink-900">Assigner une carte</h2>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <label className="block text-sm font-bold">Numéro de carte
            <input className="input mt-1" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="Numéro imprimé sur la carte" />
          </label>
          <label className="block text-sm font-bold">Téléphone client
            <input className="input mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Téléphone" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm font-bold">Prénom
              <input className="input mt-1" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </label>
            <label className="block text-sm font-bold">Nom
              <input className="input mt-1" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </label>
          </div>
        </div>
        <button disabled={busy} onClick={submit} className="btn-primary mt-4 w-full disabled:opacity-40">
          {busy ? 'Assignation…' : 'Assigner'}
        </button>
      </div>
    </div>
  );
}
