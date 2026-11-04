'use client';

import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Check, History, ShieldAlert, Wallet, X } from 'lucide-react';
import { posFetch } from '@/lib/device';
import { formatMinor } from '@/lib/money';
import type { PosCashMovement } from '@/types/pos';

interface CashMovementModalProps {
  sessionId: string;
  onClose: () => void;
  onMovementAdded?: () => void;
}

export default function CashMovementModal({ sessionId, onClose, onMovementAdded }: CashMovementModalProps) {
  const [type, setType] = useState<'CASH_OUT' | 'CASH_IN'>('CASH_OUT');
  const [amount, setAmount] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [movements, setMovements] = useState<PosCashMovement[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    try {
      const res = await posFetch(`/api/sessions/${sessionId}/cash-movements`);
      if (res.ok) {
        setMovements(await res.json());
      }
    } catch {
      // ignore
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountVal = Math.round(Number(amount) * 1000);
    if (!amountVal || amountVal <= 0) {
      setError('Veuillez saisir un montant valide.');
      return;
    }
    if (!reason.trim()) {
      setError('Veuillez saisir une justification.');
      return;
    }

    setBusy(true);
    setError(null);
    setSuccessMsg(null);

    const isOut = type === 'CASH_OUT';

    try {
      const res = await posFetch(`/api/sessions/${sessionId}/cash-movements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          amountMinor: amountVal,
          reason: reason.trim(),
          category: isOut ? 'SORTIE' : 'ENTREE',
          categoryLabel: isOut ? 'Sortie de caisse' : 'Entrée de caisse',
          paymentMethod: 'CASH',
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Erreur lors de l’enregistrement');
      }

      setSuccessMsg(
        isOut
          ? `Sortie de ${formatMinor(amountVal)} enregistrée.`
          : `Entrée de ${formatMinor(amountVal)} enregistrée.`
      );
      setAmount('');
      setReason('');
      onMovementAdded?.();
      window.dispatchEvent(new Event('pos-cash-changed'));
      loadHistory();
      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setBusy(false);
    }
  }

  const isOut = type === 'CASH_OUT';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className={`grid h-9 w-9 place-items-center rounded-xl ${isOut ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
              <Wallet size={18} />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">
                Mouvement de Caisse
              </h2>
              <p className="text-[11px] font-semibold text-slate-500">Entrée ou sortie d&apos;espèces</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition cursor-pointer"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {successMsg && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs font-bold text-emerald-800">
              <Check size={16} className="shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs font-bold text-rose-800">
              <ShieldAlert size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Type Toggle: In vs Out */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-100">
            <button
              type="button"
              onClick={() => { setType('CASH_OUT'); setError(null); }}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer ${
                isOut
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowDownRight size={16} />
              <span>Sortie (Out)</span>
            </button>
            <button
              type="button"
              onClick={() => { setType('CASH_IN'); setError(null); }}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer ${
                !isOut
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowUpRight size={16} />
              <span>Entrée (In)</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Montant */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Montant (DT) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  required
                  placeholder="0.000"
                  autoFocus
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-2xl font-black text-slate-900 placeholder:text-slate-300 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 transition text-center"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">
                  DT
                </span>
              </div>
              {Number(amount) > 0 && (
                <p className="mt-1 text-center text-[11px] font-bold text-slate-500">
                  Soit {formatMinor(Math.round(Number(amount) * 1000))}
                </p>
              )}
            </div>

            {/* Justification */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Justification / Motif *
              </label>
              <input
                type="text"
                required
                placeholder={isOut ? 'Ex : Paiement fournisseur, Transport, Dépense...' : 'Ex : Ajout fond de caisse, Apport...'}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 transition"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={busy || !amount || !reason.trim()}
              className={`w-full py-3.5 rounded-2xl font-black text-sm text-white shadow-md transition active:scale-[0.98] disabled:opacity-40 cursor-pointer ${
                isOut
                  ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                  : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
              }`}
            >
              {busy ? (
                'Enregistrement…'
              ) : isOut ? (
                `Valider la sortie (- ${amount ? Number(amount).toFixed(3) : '0.000'} DT)`
              ) : (
                `Valider l'entrée (+ ${amount ? Number(amount).toFixed(3) : '0.000'} DT)`
              )}
            </button>
          </form>

          {/* Quick toggle history */}
          <div className="pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center justify-between w-full text-xs font-bold text-slate-500 hover:text-slate-800 transition"
            >
              <span className="flex items-center gap-1.5">
                <History size={14} /> Historique récent ({movements.length})
              </span>
              <span>{showHistory ? 'Masquer' : 'Afficher'}</span>
            </button>

            {showHistory && (
              <div className="mt-2 max-h-40 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/50 p-2">
                {movements.length === 0 ? (
                  <p className="py-2 text-center text-xs text-slate-400">Aucun mouvement</p>
                ) : (
                  movements.slice(0, 5).map((m) => {
                    const mOut = m.type === 'CASH_OUT' || m.type === 'REMOVE';
                    return (
                      <div key={m.id || String(m.createdAt)} className="flex items-center justify-between py-1.5 text-xs">
                        <span className="truncate pr-2 font-medium text-slate-700">{m.reason}</span>
                        <span className={`font-black tabular-nums shrink-0 ${mOut ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {mOut ? '-' : '+'}
                          {formatMinor(m.amountMinor)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
