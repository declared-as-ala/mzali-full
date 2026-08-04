'use client';

import { useEffect, useMemo, useState } from 'react';
import { Banknote, CheckCircle2, X } from 'lucide-react';
import { formatMinor } from '@/lib/money';
import type { PosSalePaymentInput } from '@/types/pos';

const QUICK_AMOUNTS = [5000, 10000, 20000, 50000];
type PaymentMethod = PosSalePaymentInput['method'];

/** Cash only — the store doesn't accept other payment methods at the till. */
const METHOD: PaymentMethod = 'CASH';

export default function PaymentModal({ totalMinor, busy, error, onClose, onConfirm, onDisplayChange }: {
  totalMinor: number;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (method: PaymentMethod, cashReceivedMinor: number | null) => void;
  onDisplayChange?: (payment: { method: PaymentMethod; totalMinor: number; cashReceivedMinor: number | null; changeMinor: number }) => void;
}) {
  const [cashReceived, setCashReceived] = useState<number>(totalMinor);
  const change = useMemo(() => Math.max(0, cashReceived - totalMinor), [cashReceived, totalMinor]);
  const insufficient = cashReceived < totalMinor;

  useEffect(() => {
    onDisplayChange?.({
      method: METHOD,
      totalMinor,
      cashReceivedMinor: cashReceived,
      changeMinor: change,
    });
  }, [cashReceived, change, onDisplayChange, totalMinor]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-2.5 text-emerald-700"><Banknote size={20} /></div>
            <div><h2 className="text-xl font-black text-slate-900">Encaisser la vente</h2><p className="text-xs font-semibold text-slate-500">Paiement comptant</p></div>
          </div>
          <button type="button" disabled={busy} onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40" aria-label="Fermer"><X size={18} /></button>
        </div>

        <div className="mb-5 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-center">
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-emerald-700">Montant total à encaisser</p>
          <p className="text-4xl font-black text-emerald-700">{formatMinor(totalMinor)}</p>
        </div>

        <div className="mb-5 space-y-3">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">Montant reçu du client (DT)</label>
          <input
            type="number"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 text-center text-3xl font-black text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
            value={cashReceived / 1000}
            min={0}
            step={0.1}
            onChange={(event) => setCashReceived(Math.round(Number(event.target.value || 0) * 1000))}
            autoFocus
          />
          <div className="flex flex-wrap gap-2">
            {QUICK_AMOUNTS.map((amount) => <button key={amount} type="button" onClick={() => setCashReceived(amount)} className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 transition hover:bg-slate-50">{formatMinor(amount)}</button>)}
            <button type="button" onClick={() => setCashReceived(totalMinor)} className="min-h-11 flex-1 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-black text-emerald-700 transition hover:bg-emerald-100">Exact</button>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-center"><p className={`font-black ${change > 0 ? 'text-emerald-700' : 'text-slate-600'}`}>Monnaie à rendre : {formatMinor(change)}</p></div>
        </div>

        {error && <p className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-center text-xs font-bold text-rose-700" role="alert">{error}</p>}

        <button
          type="button"
          disabled={busy || insufficient}
          onClick={() => onConfirm(METHOD, cashReceived)}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 font-black text-white shadow-xl shadow-emerald-600/20 transition hover:bg-emerald-700 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40"
        >
          <CheckCircle2 size={20} />
          <span>{busy ? 'Traitement…' : 'CONFIRMER — ESPÈCES'}</span>
        </button>
      </div>
    </div>
  );
}
