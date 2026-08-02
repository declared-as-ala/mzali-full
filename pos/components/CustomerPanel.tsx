'use client';
import { useEffect, useState } from 'react';
import { Award, CalendarClock, CreditCard, Gift, Heart, Receipt, Search, ShieldAlert, User, UserPlus, Wallet, X } from 'lucide-react';
import { posFetch } from '@/lib/device';
import { formatMinor } from '@/lib/money';
import type { LoyaltyAccount, PosCustomerSummary, RedeemPreviewResult } from '@/types/pos';

export default function CustomerPanel({
  phone, onPhoneChange, onLookup, looking,
  customerId, customerName, account, notFound,
  onCreateAccount, creating,
  redeemInput, onRedeemInputChange, onPreviewRedeem, previewing, preview,
  managerEmployeeId, managerPassword, onManagerChange,
  cardNumber, onCardNumberChange, onCardLookup, cardLooking, cardUnassigned,
  onAssignCard, cardAssigning,
}: {
  phone: string;
  onPhoneChange: (v: string) => void;
  onLookup: () => void;
  looking: boolean;
  customerId: string | null;
  customerName: string | null;
  account: LoyaltyAccount | null;
  notFound: boolean;
  onCreateAccount: (firstName: string) => void;
  creating: boolean;
  redeemInput: string;
  onRedeemInputChange: (v: string) => void;
  onPreviewRedeem: () => void;
  previewing: boolean;
  preview: RedeemPreviewResult | null;
  managerEmployeeId: string;
  managerPassword: string;
  onManagerChange: (employeeId: string, password: string) => void;
  cardNumber: string;
  onCardNumberChange: (v: string) => void;
  onCardLookup: () => void;
  cardLooking: boolean;
  cardUnassigned: boolean;
  onAssignCard: (cardNumber: string, phone: string, firstName?: string, lastName?: string) => Promise<boolean>;
  cardAssigning: boolean;
}) {
  const [newName, setNewName] = useState('');
  const [assignPhone, setAssignPhone] = useState('');
  const [assignName, setAssignName] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [summary, setSummary] = useState<PosCustomerSummary | null>(null);

  function openAssignModal() {
    if (phone) setAssignPhone(phone);
    setShowAssignModal(true);
  }

  useEffect(() => {
    if (!cardUnassigned) { setAssignPhone(''); setAssignName(''); }
  }, [cardUnassigned]);

  useEffect(() => {
    if (!customerId) { setSummary(null); return; }
    let cancelled = false;
    posFetch(`/api/customers/${customerId}/summary`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: PosCustomerSummary) => { if (!cancelled) setSummary(data); })
      .catch(() => { if (!cancelled) setSummary(null); });
    return () => { cancelled = true; };
  }, [customerId]);

  return (
    <div className="border-b border-slate-200 p-4 space-y-3 bg-slate-50/70">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black uppercase text-slate-500 tracking-wider">Client & Fidélité</span>
        <button
          onClick={openAssignModal}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 hover:text-blue-800 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-xl transition"
        >
          <UserPlus size={13} /> Assigner carte
        </button>
      </div>

      {/* Phone lookup input */}
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 shadow-sm">
        <User size={15} className="text-slate-400" />
        <input
          type="tel"
          placeholder="Client (téléphone)"
          className="flex-1 bg-transparent text-xs font-semibold outline-none placeholder:text-slate-400"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onLookup(); }}
        />
        {phone && (
          <button onClick={onLookup} disabled={looking} className="text-slate-400 hover:text-blue-600 disabled:opacity-40" aria-label="Rechercher">
            <Search size={15} />
          </button>
        )}
      </div>

      {/* Card scanner / lookup input */}
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 shadow-sm">
        <CreditCard size={15} className="text-slate-400" />
        <input
          type="text"
          placeholder="Scan ou numéro carte PVC"
          className="flex-1 bg-transparent text-xs font-semibold outline-none placeholder:text-slate-400"
          value={cardNumber}
          onChange={(e) => onCardNumberChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onCardLookup(); }}
        />
        {cardNumber && (
          <button onClick={onCardLookup} disabled={cardLooking} className="text-slate-400 hover:text-blue-600 disabled:opacity-40" aria-label="Rechercher la carte">
            <Search size={15} />
          </button>
        )}
      </div>

      {/* Inline banner when card scanned is unassigned */}
      {cardUnassigned && (
        <div className="rounded-2xl bg-amber-50 p-3 text-xs border border-amber-200 text-amber-900 space-y-2">
          <p className="flex items-center gap-1.5 font-bold text-amber-800">
            <ShieldAlert size={14} /> Carte {cardNumber} non attribuée
          </p>
          <div className="space-y-2">
            <input
              type="tel"
              placeholder="Téléphone du client"
              className="input w-full py-2 text-xs"
              value={assignPhone || phone}
              onChange={(e) => setAssignPhone(e.target.value)}
            />
            <input
              placeholder="Prénom (optionnel)"
              className="input w-full py-2 text-xs"
              value={assignName}
              onChange={(e) => setAssignName(e.target.value)}
            />
            <button
              onClick={async () => {
                const ok = await onAssignCard(cardNumber, assignPhone || phone, assignName);
                if (ok) { setAssignPhone(''); setAssignName(''); }
              }}
              disabled={cardAssigning || (!assignPhone.trim() && !phone.trim())}
              className="btn-primary inline-flex w-full items-center justify-center gap-1.5 px-3 py-2 text-xs disabled:opacity-40"
            >
              <UserPlus size={14} /> Attribuer cette carte au POS
            </button>
          </div>
        </div>
      )}

      {/* Found customer without loyalty account */}
      {customerId && !account && notFound === false && (
        <div className="rounded-2xl bg-white border border-slate-200 p-3 text-xs space-y-2 shadow-sm">
          <p className="font-bold text-slate-900">{customerName || 'Client'} — Pas de compte fidélité</p>
          <div className="flex gap-2">
            <input
              placeholder="Prénom"
              className="input flex-1 py-1.5 text-xs"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button
              onClick={() => onCreateAccount(newName)}
              disabled={creating}
              className="btn-primary inline-flex items-center gap-1 px-3 py-1.5 text-xs disabled:opacity-40"
            >
              <UserPlus size={13} /> Créer
            </button>
          </div>
        </div>
      )}

      {/* Active Loyalty Account Info */}
      {account && (
        <div className="rounded-2xl bg-blue-50 p-3 text-xs border border-blue-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 font-bold text-blue-900">
              <Award size={15} className="text-blue-600" /> {account.cardNumber}
            </p>
            <p className="font-black text-emerald-700">{account.pointsBalance} pts</p>
          </div>

          {account.status === 'ACTIVE' ? (
            <>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  placeholder="Points à échanger"
                  className="input flex-1 py-1.5 text-xs"
                  value={redeemInput}
                  onChange={(e) => onRedeemInputChange(e.target.value)}
                />
                <button onClick={onPreviewRedeem} disabled={previewing || !redeemInput} className="btn-ghost inline-flex items-center gap-1 px-3 py-1.5 text-xs disabled:opacity-40">
                  <Gift size={13} /> Appliquer
                </button>
              </div>
              {preview && (
                <p className={`text-xs font-bold ${preview.valid ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {preview.valid ? `Remise : ${formatMinor(preview.discountMinor)}` : preview.error}
                </p>
              )}
            </>
          ) : (
            <p className="text-xs font-bold text-rose-600">Compte suspendu</p>
          )}
        </div>
      )}

      {/* Customer quick view — purchase history, spend, last visit,
          favorites. POS-only data, independent of loyalty membership. */}
      {customerId && summary && (summary.visitCount > 0 || summary.favoriteProducts.length > 0) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs shadow-sm space-y-2.5">
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Historique client</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-slate-50 p-2 text-center">
              <Wallet size={13} className="mx-auto mb-1 text-slate-400" />
              <p className="font-black text-slate-800">{formatMinor(summary.totalSpentInStoreMinor)}</p>
              <p className="text-[9px] text-slate-400">Dépensé (boutique)</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-2 text-center">
              <Receipt size={13} className="mx-auto mb-1 text-slate-400" />
              <p className="font-black text-slate-800">{summary.visitCount}</p>
              <p className="text-[9px] text-slate-400">Visites</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-2 text-center">
              <CalendarClock size={13} className="mx-auto mb-1 text-slate-400" />
              <p className="font-black text-slate-800">{summary.lastVisitAt ? new Date(summary.lastVisitAt).toLocaleDateString('fr-FR') : '—'}</p>
              <p className="text-[9px] text-slate-400">Dernière visite</p>
            </div>
          </div>
          {summary.favoriteProducts.length > 0 && (
            <div>
              <p className="mb-1 flex items-center gap-1 text-[10px] font-bold text-slate-400"><Heart size={11} /> Produits favoris</p>
              <div className="flex flex-wrap gap-1">
                {summary.favoriteProducts.slice(0, 4).map((p) => (
                  <span key={p.productId} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    {p.name} ×{p.qtyPurchased}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Assign Card Modal */}
      {showAssignModal && (
        <AssignCardPosModal
          initialPhone={phone}
          initialCardNumber={cardNumber}
          onClose={() => setShowAssignModal(false)}
          onAssign={async (num, ph, fn, ln) => {
            const ok = await onAssignCard(num, ph, fn, ln);
            if (ok) setShowAssignModal(false);
          }}
          busy={cardAssigning}
        />
      )}
    </div>
  );
}

function AssignCardPosModal({
  initialPhone, initialCardNumber, onClose, onAssign, busy,
}: {
  initialPhone: string;
  initialCardNumber: string;
  onClose: () => void;
  onAssign: (cardNumber: string, phone: string, firstName?: string, lastName?: string) => Promise<void>;
  busy: boolean;
}) {
  const [num, setNum] = useState(initialCardNumber);
  const [ph, setPh]   = useState(initialPhone);
  const [fn, setFn]   = useState('');
  const [ln, setLn]   = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!num.trim() || !ph.trim()) { setError('Numéro de carte et téléphone requis'); return; }
    setError(null);
    await onAssign(num.trim(), ph.trim(), fn.trim() || undefined, ln.trim() || undefined);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="rounded-2xl bg-blue-50 p-2.5 text-blue-600 border border-blue-100">
              <CreditCard size={18} />
            </div>
            <h2 className="text-sm font-black text-slate-900">Assigner une carte fidélité</h2>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={16} />
          </button>
        </div>

        {error && <p className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</p>}

        <div className="space-y-3 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">Numéro de carte PVC <span className="text-rose-500">*</span></label>
            <input
              className="input text-xs py-2.5 font-mono font-bold"
              placeholder="Ex. 1000000001 ou scanner QR"
              value={num}
              onChange={(e) => setNum(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1.5">Téléphone du client <span className="text-rose-500">*</span></label>
            <input
              type="tel"
              className="input text-xs py-2.5"
              placeholder="Ex. 97991266"
              value={ph}
              onChange={(e) => setPh(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-bold text-slate-700 mb-1.5">Prénom</label>
              <input className="input text-xs py-2.5" value={fn} onChange={(e) => setFn(e.target.value)} />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1.5">Nom</label>
              <input className="input text-xs py-2.5" value={ln} onChange={(e) => setLn(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-ghost px-4 py-2.5 text-xs font-bold">Annuler</button>
          <button
            onClick={submit}
            disabled={busy || !num.trim() || !ph.trim()}
            className="btn-primary inline-flex items-center gap-1.5 px-4 py-2.5 text-xs disabled:opacity-40"
          >
            {busy ? 'Assignation…' : 'Attribuer la carte'}
          </button>
        </div>
      </div>
    </div>
  );
}
