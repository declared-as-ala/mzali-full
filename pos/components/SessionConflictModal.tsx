'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, KeyRound, LogIn, ShieldAlert, ShieldCheck, User, Wallet, X } from 'lucide-react';
import { posFetch } from '@/lib/device';
import { formatMinor } from '@/lib/money';
import type { ActiveSessionOtherCashier } from '@/types/pos';

interface SessionConflictModalProps {
  conflict: ActiveSessionOtherCashier;
  currentCashierName?: string;
  onResolved?: () => void;
  onSuccess?: () => void;
  onClose?: () => void;
  onCancel?: () => void;
}

export default function SessionConflictModal({
  conflict,
  currentCashierName = 'Caissier',
  onResolved,
  onSuccess,
  onClose,
  onCancel,
}: SessionConflictModalProps) {
  const triggerResolved = onResolved || onSuccess || (() => {});
  const triggerClose = onClose || onCancel;
  const router = useRouter();
  const [managerMode, setManagerMode] = useState<'SELECT' | 'CLOSE' | 'TAKEOVER'>('SELECT');
  const [countedCash, setCountedCash] = useState<string>(String(conflict.expectedCashMinor / 1000));
  const [note, setNote] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleTakeover() {
    setBusy(true);
    setError(null);
    try {
      const res = await posFetch(`/api/sessions/${conflict.sessionId}/takeover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim() || `Reprise par ${currentCashierName}` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Échec de la reprise de caisse');
      triggerResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function handleForceClose() {
    setBusy(true);
    setError(null);
    try {
      const countedMinor = Math.round(Number(countedCash) * 1000);
      const res = await posFetch(`/api/sessions/${conflict.sessionId}/force-close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          closingCountedCashMinor: countedMinor,
          note: note.trim() || `Fermeture administrative par ${currentCashierName}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Échec de la clôture de caisse');
      router.replace('/sessions/open');
      triggerResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-conflict-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-amber-100 bg-amber-50/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-700">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h2 id="session-conflict-title" className="text-base sm:text-lg font-black text-amber-950">
                Caisse Occupée
              </h2>
              <p className="text-xs text-amber-700">Session ouverte par un autre utilisateur</p>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-200"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-xs font-bold text-red-800">
              <ShieldAlert size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {managerMode === 'SELECT' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Caissier titulaire :</span>
                  <strong className="text-slate-900 text-sm">{conflict.cashierName}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Terminal :</span>
                  <strong className="text-slate-900">{conflict.terminalName}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Ouvert depuis :</span>
                  <span className="text-slate-700 font-medium">
                    {new Date(conflict.openedAt).toLocaleString('fr-TN', { timeZone: 'Africa/Tunis' })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Fond initial :</span>
                  <strong className="text-slate-900">{formatMinor(conflict.openingCashMinor)}</strong>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-blue-900 font-bold">
                  <span>Solde théorique actuel :</span>
                  <span>{formatMinor(conflict.expectedCashMinor)}</span>
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Vous êtes actuellement connecté en tant que <strong>{currentCashierName}</strong>. Pour éviter toute
                erreur comptable ou conflit de tiroir-caisse, les ventes sont suspendues jusqu&apos;à résolution.
              </p>

              <div className="pt-2 space-y-2.5">
                <button
                  type="button"
                  onClick={() => router.push('/login')}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-slate-100 hover:bg-slate-200 px-4 py-3 text-xs sm:text-sm font-bold text-slate-800 transition cursor-pointer"
                >
                  <LogIn size={16} />
                  <span>Se connecter avec le compte de {conflict.cashierName}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setManagerMode('CLOSE')}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-blue-600 hover:bg-blue-700 px-4 py-3 text-xs sm:text-sm font-bold text-white shadow-md shadow-blue-600/20 transition cursor-pointer"
                >
                  <ShieldCheck size={16} />
                  <span>Clôturer la session précédente &amp; Ouvrir ma caisse</span>
                </button>

                <button
                  type="button"
                  onClick={() => setManagerMode('TAKEOVER')}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl border border-slate-200 hover:bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-700 transition cursor-pointer"
                >
                  <KeyRound size={15} />
                  <span>Transférer la caisse à mon nom (Reprise autorisée)</span>
                </button>
              </div>
            </div>
          )}

          {managerMode === 'CLOSE' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-500 uppercase">Clôture administrative</span>
                <button
                  type="button"
                  onClick={() => setManagerMode('SELECT')}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  Retour
                </button>
              </div>

              <p className="text-xs text-slate-600">
                Cette action va clôturer définitivement la session de <strong>{conflict.cashierName}</strong>, générer
                son Ticket Z, et vous rediriger vers l&apos;ouverture d&apos;une nouvelle session.
              </p>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Espèces comptées en caisse (DT)
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={countedCash}
                  onChange={(e) => setCountedCash(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-center text-xl font-black text-slate-900 focus:border-blue-600 focus:outline-none"
                />
                <p className="mt-1 text-center text-xs text-slate-400">
                  Théorique : {formatMinor(conflict.expectedCashMinor)}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Motif / Justification de clôture
                </label>
                <input
                  type="text"
                  placeholder="Ex : Fin de service, caissier absent, relève..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-800 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={handleForceClose}
                className="w-full rounded-2xl bg-red-600 hover:bg-red-700 py-3 text-sm font-bold text-white shadow-md shadow-red-600/20 transition cursor-pointer disabled:opacity-50"
              >
                {busy ? 'Clôture en cours…' : 'CONFIRMER LA CLÔTURE & CRÉER LE TICKET Z'}
              </button>
            </div>
          )}

          {managerMode === 'TAKEOVER' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-500 uppercase">Transfert de caisse</span>
                <button
                  type="button"
                  onClick={() => setManagerMode('SELECT')}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  Retour
                </button>
              </div>

              <p className="text-xs text-slate-600">
                La session actuelle restera ouverte et sera immédiatement assignée à <strong>{currentCashierName}</strong>.
                Une entrée d&apos;audit sera enregistrée.
              </p>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Motif du transfert
                </label>
                <input
                  type="text"
                  placeholder="Ex : Remplacement temporaire, passation autorisée..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-800 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={handleTakeover}
                className="w-full rounded-2xl bg-blue-600 hover:bg-blue-700 py-3 text-sm font-bold text-white shadow-md shadow-blue-600/20 transition cursor-pointer disabled:opacity-50"
              >
                {busy ? 'Transfert en cours…' : 'CONFIRMER LA REPRISE DE CAISSE'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
