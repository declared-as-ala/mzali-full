'use client';
import { useMemo, useState } from 'react';
import { Banknote, X, CheckCircle2 } from 'lucide-react';
import { formatMinor } from '@/lib/money';
import type { PosPaymentMethod } from '@/types/pos';

const QUICK_AMOUNTS = [5000, 10000, 20000, 50000]; // 5, 10, 20, 50 DT

export default function PaymentModal({
  totalMinor, busy, error, onClose, onConfirm,
}: {
  totalMinor: number;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (method: PosPaymentMethod, cashReceivedMinor: number | null) => void;
}) {
  const [cashReceived, setCashReceived] = useState<number>(totalMinor);

  const change = useMemo(() => Math.max(0, cashReceived - totalMinor), [cashReceived, totalMinor]);
  const insufficient = cashReceived < totalMinor;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="rounded-2xl bg-emerald-50 p-2.5 text-emerald-600 border border-emerald-100">
              <Banknote size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">Paiement Espèces</h2>
              <p className="text-xs font-semibold text-slate-500">Règlement en comptant</p>
            </div>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <div className="mb-6 text-center rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-1">Montant Total à Encaisser</p>
          <p className="text-4xl font-black text-emerald-600">{formatMinor(totalMinor)}</p>
        </div>

        <div className="mb-6 space-y-3">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">Montant Reçu du Client (DT)</label>
          <input
            type="number"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 text-center text-3xl font-black text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
            value={cashReceived / 1000}
            min={0}
            step={0.1}
            onChange={(e) => setCashReceived(Math.round(Number(e.target.value || 0) * 1000))}
            autoFocus
          />
          
          <div className="flex flex-wrap gap-2">
            {QUICK_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setCashReceived(amt)}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition"
              >
                {formatMinor(amt)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCashReceived(totalMinor)}
              className="flex-1 min-h-[44px] rounded-xl border border-emerald-200 bg-emerald-50 font-black text-xs text-emerald-700 hover:bg-emerald-100 transition"
            >
              Exact
            </button>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5 text-center">
            <p className={`text-base font-black ${change > 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
              Monnaie à rendre : {formatMinor(change)}
            </p>
          </div>
        </div>

        {error && (
          <p className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-center text-xs font-bold text-rose-700">{error}</p>
        )}

        <button
          type="button"
          disabled={busy || insufficient}
          onClick={() => onConfirm('CASH', cashReceived)}
          className="group relative flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-emerald-600 font-black text-white shadow-xl shadow-emerald-600/20 transition hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-40 disabled:pointer-events-none"
        >
          <CheckCircle2 size={20} />
          <span>{busy ? 'Traitement…' : 'CONFIRMER L\'ENCAISSEMENT'}</span>
        </button>
      </div>
    </div>
  );
}
