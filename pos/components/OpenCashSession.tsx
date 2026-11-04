'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Clock, Monitor, Sparkles, User, Wallet } from 'lucide-react';
import { getTerminalCode, posFetch } from '@/lib/device';
import { formatMinor } from '@/lib/money';
import SessionConflictModal from '@/components/SessionConflictModal';
import type { CurrentSessionResponse } from '@/types/pos';

const FLOAT_PRESETS_DT = [50, 100, 150, 200];

export default function OpenCashSession({ onCancel }: { onCancel?: () => void }) {
  const router = useRouter();
  const [openingCash, setOpeningCash] = useState<number>(150000); // 150 DT default
  const [note, setNote] = useState('');
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictSession, setConflictSession] = useState<CurrentSessionResponse['activeSessionOtherCashier'] | null>(null);
  const [terminalName, setTerminalName] = useState('Terminal de caisse');
  const [cashierName, setCashierName] = useState('Caissier');

  const now = new Date();
  const formattedDate = now.toLocaleDateString('fr-TN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const formattedTime = now.toLocaleTimeString('fr-TN', { hour: '2-digit', minute: '2-digit' });

  useEffect(() => {
    try {
      const code = getTerminalCode();
      if (code) setTerminalName(code);
    } catch { /* ignore */ }

    posFetch('/api/sessions', { cache: 'no-store' })
      .then(async (res) => {
        const data: CurrentSessionResponse & { error?: string } = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Caisse indisponible');
        return data;
      })
      .then((data) => {
        if (data.session) {
          router.replace('/till');
        } else if (data.activeSessionOtherCashier) {
          setConflictSession(data.activeSessionOtherCashier);
          setChecking(false);
        } else {
          setChecking(false);
        }
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Caisse indisponible');
        setChecking(false);
      });
  }, [router]);

  async function handleOpen() {
    setBusy(true);
    setError(null);
    try {
      const current = await posFetch('/api/sessions', { cache: 'no-store' });
      const existing: CurrentSessionResponse & { error?: string } = await current.json();
      if (!current.ok) throw new Error(existing.error ?? 'Caisse indisponible');

      if (existing.session) {
        router.replace('/till');
        return;
      }

      if (existing.activeSessionOtherCashier) {
        setConflictSession(existing.activeSessionOtherCashier);
        setBusy(false);
        return;
      }

      const res = await posFetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openingCashMinor: openingCash,
          note: note.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Impossible d'ouvrir la session");
      window.dispatchEvent(new Event('pos-cash-changed'));
      router.replace('/till');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900/60 p-4 sm:p-6 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ouverture de caisse"
        className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-100"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy) onCancel?.();
        }}
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="grid h-16 w-16 place-items-center rounded-3xl bg-emerald-50 text-emerald-600 shadow-sm border border-emerald-100">
            <Wallet size={30} />
          </div>
          <h1 className="mt-4 text-2xl font-black text-slate-900">Ouverture de caisse</h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Initialisez votre fond de caisse avant de commencer les encaissements.
          </p>
        </div>

        {/* Info badges */}
        <div className="mb-5 rounded-2xl bg-slate-50 p-3.5 text-xs text-slate-600 space-y-2 border border-slate-100">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium text-slate-500">
              <Monitor size={13} /> Terminal
            </span>
            <strong className="text-slate-800">{terminalName}</strong>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium text-slate-500">
              <Clock size={13} /> Date & Heure
            </span>
            <span className="font-semibold text-slate-700 capitalize">{formattedTime} · {formattedDate}</span>
          </div>
        </div>

        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Fond de caisse initial
            </label>
            <span className="text-xs font-black text-emerald-700">{formatMinor(openingCash)}</span>
          </div>

          <div className="relative mb-3">
            <input
              type="number"
              autoFocus
              aria-label="Fond de caisse initial (DT)"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 text-center text-3xl font-black text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
              value={openingCash / 1000}
              min={0}
              step={1}
              onChange={(e) => setOpeningCash(Math.max(0, Math.round(Number(e.target.value || 0) * 1000)))}
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
              DT
            </span>
          </div>

          {/* Presets */}
          <div className="grid grid-cols-4 gap-2">
            {FLOAT_PRESETS_DT.map((dt) => {
              const minor = dt * 1000;
              const isSelected = openingCash === minor;
              return (
                <button
                  key={dt}
                  type="button"
                  onClick={() => setOpeningCash(minor)}
                  className={`rounded-xl py-2 text-xs font-bold transition border ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {dt} DT
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
            Note d&apos;ouverture (optionnelle)
          </label>
          <input
            type="text"
            placeholder="Ex: Billets de 20 et 10 DT, pièces..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            maxLength={200}
          />
        </div>

        {error && (
          <p className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-center text-xs font-bold text-rose-700">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={busy || checking}
          onClick={handleOpen}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-base font-black uppercase tracking-wider text-white shadow-xl shadow-emerald-600/20 transition hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-40 disabled:pointer-events-none"
        >
          {checking ? 'Vérification de la caisse…' : busy ? 'Ouverture en cours…' : 'Ouvrir la caisse'}
        </button>

        {onCancel && (
          <button
            type="button"
            className="mt-3 w-full py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition"
            disabled={busy}
            onClick={onCancel}
          >
            Annuler
          </button>
        )}
      </div>

      {conflictSession && (
        <SessionConflictModal
          conflict={conflictSession}
          onSuccess={() => {
            setConflictSession(null);
            router.replace('/till');
          }}
          onCancel={() => {
            setConflictSession(null);
          }}
        />
      )}
    </div>
  );
}