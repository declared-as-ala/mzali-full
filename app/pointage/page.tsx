'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Delete, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

type Screen =
  | { name: 'pin' }
  | { name: 'loading' }
  | { name: 'ready_to_start'; employeeName: string }
  | { name: 'ready_to_end'; employeeName: string; clockIn: string }
  | { name: 'blocked' }
  | { name: 'success_in'; clockIn: string }
  | { name: 'success_out'; clockIn: string; clockOut: string; durationMinutes: number };

const AUTO_RESET_MS = 4000;
const MAX_PIN_LENGTH = 6;

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Tunis' });
}

function formatDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export default function PointagePage() {
  const [screen, setScreen] = useState<Screen>({ name: 'pin' });
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsedNow, setElapsedNow] = useState(Date.now());
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    setScreen({ name: 'pin' });
    setPin('');
    setPinError(null);
    setBusy(false);
  };

  // Live "temps actuel" ticker while waiting on the ready_to_end screen.
  useEffect(() => {
    if (screen.name !== 'ready_to_end') return;
    const t = setInterval(() => setElapsedNow(Date.now()), 1000 * 15);
    return () => clearInterval(t);
  }, [screen.name]);

  const liveElapsedLabel = useMemo(() => {
    if (screen.name !== 'ready_to_end') return '';
    const minutes = Math.max(0, Math.round((elapsedNow - new Date(screen.clockIn).getTime()) / 60000));
    return formatDuration(minutes);
  }, [screen, elapsedNow]);

  // Auto-reset the kiosk back to the PIN screen a few seconds after any
  // terminal (success/blocked) screen — the whole point being that many
  // employees share the same device, see #34.
  useEffect(() => {
    if (screen.name === 'success_in' || screen.name === 'success_out' || screen.name === 'blocked') {
      resetTimerRef.current = setTimeout(reset, AUTO_RESET_MS);
      return () => { if (resetTimerRef.current) clearTimeout(resetTimerRef.current); };
    }
  }, [screen]);

  function pressDigit(d: string) {
    if (busy || pin.length >= MAX_PIN_LENGTH) return;
    setPinError(null);
    setPin((p) => p + d);
  }
  function pressBackspace() {
    if (busy) return;
    setPin((p) => p.slice(0, -1));
  }

  async function submitPin() {
    if (pin.length < 4 || busy) return;
    setBusy(true);
    setScreen({ name: 'loading' });
    try {
      const res = await fetch('/api/pointage/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!data?.ok) {
        setShake(true);
        setTimeout(() => setShake(false), 400);
        setPinError('Code PIN incorrect.');
        setPin('');
        setScreen({ name: 'pin' });
        setBusy(false);
        return;
      }
      if (data.status === 'ready_to_start') {
        setScreen({ name: 'ready_to_start', employeeName: data.employee.firstName });
        setBusy(false);
      } else if (data.status === 'ready_to_end') {
        setScreen({ name: 'ready_to_end', employeeName: data.employee.firstName, clockIn: data.session.clockIn });
        setBusy(false);
      } else {
        setScreen({ name: 'blocked' });
        setBusy(false);
      }
    } catch {
      setPinError('Erreur réseau — réessayez.');
      setPin('');
      setScreen({ name: 'pin' });
      setBusy(false);
    }
  }

  async function confirmClockIn() {
    setBusy(true);
    try {
      const res = await fetch('/api/pointage/clock-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (data?.ok) {
        setScreen({ name: 'success_in', clockIn: data.session.clockIn });
      } else {
        setPinError(data?.error || 'Erreur — réessayez.');
        setScreen({ name: 'pin' });
      }
    } catch {
      setPinError('Erreur réseau — réessayez.');
      setScreen({ name: 'pin' });
    } finally {
      setPin('');
      setBusy(false);
    }
  }

  async function confirmClockOut() {
    setBusy(true);
    try {
      const res = await fetch('/api/pointage/clock-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (data?.ok) {
        setScreen({
          name: 'success_out',
          clockIn: data.session.clockIn,
          clockOut: data.session.clockOut,
          durationMinutes: data.session.durationMinutes ?? 0,
        });
      } else {
        setPinError(data?.error || 'Erreur — réessayez.');
        setScreen({ name: 'pin' });
      }
    } catch {
      setPinError('Erreur réseau — réessayez.');
      setScreen({ name: 'pin' });
    } finally {
      setPin('');
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-10 text-white select-none">
      <div className="mb-8 text-center">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Mzali Boutique</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Pointage</h1>
      </div>

      <div className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl sm:p-8">
        {screen.name === 'pin' && (
          <div className={shake ? 'animate-[shake_0.4s]' : ''}>
            <p className="mb-5 text-center text-base font-bold text-slate-300 sm:text-lg">Entrez votre code PIN</p>
            <div className="mb-6 flex items-center justify-center gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <span
                  key={i}
                  className={`h-4 w-4 rounded-full border-2 transition-colors sm:h-5 sm:w-5 ${
                    i < pin.length ? 'border-emerald-400 bg-emerald-400' : 'border-slate-700 bg-transparent'
                  }`}
                />
              ))}
            </div>
            {pinError && <p className="mb-4 text-center text-sm font-bold text-rose-400">{pinError}</p>}
            <Keypad onDigit={pressDigit} onBackspace={pressBackspace} disabled={busy} />
            <button
              onClick={submitPin}
              disabled={pin.length < 4 || busy}
              className="mt-6 w-full rounded-2xl bg-emerald-500 py-4 text-lg font-black tracking-wide text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
            >
              VALIDER
            </button>
          </div>
        )}

        {screen.name === 'loading' && (
          <div className="flex flex-col items-center gap-4 py-10">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-emerald-400" />
            <p className="text-slate-400">Vérification…</p>
          </div>
        )}

        {screen.name === 'ready_to_start' && (
          <div className="text-center">
            <p className="text-2xl font-black">Bonjour {screen.employeeName}</p>
            <p className="mt-2 text-sm text-slate-400">Vous n&apos;avez pas encore commencé votre journée.</p>
            <div className="my-6 flex items-center justify-center gap-2 text-slate-300">
              <Clock size={18} />
              <span className="font-mono text-xl font-bold">
                {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Tunis' })}
              </span>
            </div>
            <button
              onClick={confirmClockIn}
              disabled={busy}
              className="w-full rounded-2xl bg-emerald-500 py-5 text-lg font-black tracking-wide text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
            >
              {busy ? '…' : 'COMMENCER LA JOURNÉE'}
            </button>
            <button onClick={reset} className="mt-4 text-sm font-bold text-slate-500 hover:text-slate-300">Annuler</button>
          </div>
        )}

        {screen.name === 'ready_to_end' && (
          <div className="text-center">
            <p className="text-2xl font-black">Bonjour {screen.employeeName}</p>
            <div className="my-5 space-y-1 rounded-2xl bg-slate-800/70 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Début</p>
              <p className="font-mono text-xl font-bold">{formatClock(screen.clockIn)}</p>
              <p className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-500">Temps actuel</p>
              <p className="font-mono text-2xl font-black text-emerald-400">{liveElapsedLabel}</p>
            </div>
            <button
              onClick={confirmClockOut}
              disabled={busy}
              className="w-full rounded-2xl bg-rose-500 py-5 text-lg font-black tracking-wide text-white transition hover:bg-rose-400 disabled:opacity-60"
            >
              {busy ? '…' : 'QUITTER / TERMINER LA JOURNÉE'}
            </button>
            <button onClick={reset} className="mt-4 text-sm font-bold text-slate-500 hover:text-slate-300">Annuler</button>
          </div>
        )}

        {screen.name === 'blocked' && (
          <div className="text-center">
            <AlertTriangle size={40} className="mx-auto mb-4 text-amber-400" />
            <p className="text-lg font-bold text-amber-300">
              Une session précédente n&apos;a pas été clôturée. Veuillez contacter l&apos;administrateur.
            </p>
            <button onClick={reset} className="mt-6 w-full rounded-2xl bg-slate-800 py-3 text-sm font-bold text-slate-300 hover:bg-slate-700">
              Nouveau pointage
            </button>
          </div>
        )}

        {screen.name === 'success_in' && (
          <div className="text-center">
            <CheckCircle2 size={48} className="mx-auto mb-4 text-emerald-400" />
            <p className="text-xl font-black text-emerald-400">Pointage enregistré</p>
            <p className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-500">Début</p>
            <p className="font-mono text-2xl font-black">{formatClock(screen.clockIn)}</p>
            <button onClick={reset} className="mt-8 w-full rounded-2xl bg-slate-800 py-3 text-sm font-bold text-slate-300 hover:bg-slate-700">
              Nouveau pointage
            </button>
          </div>
        )}

        {screen.name === 'success_out' && (
          <div className="text-center">
            <CheckCircle2 size={48} className="mx-auto mb-4 text-emerald-400" />
            <p className="text-xl font-black text-emerald-400">Fin de journée enregistrée</p>
            <p className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-500">Aujourd&apos;hui</p>
            <p className="font-mono text-2xl font-black">{formatDuration(screen.durationMinutes)}</p>
            <button onClick={reset} className="mt-8 w-full rounded-2xl bg-slate-800 py-3 text-sm font-bold text-slate-300 hover:bg-slate-700">
              Nouveau pointage
            </button>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes shake {
          10%, 90% { transform: translateX(-2px); }
          20%, 80% { transform: translateX(4px); }
          30%, 50%, 70% { transform: translateX(-8px); }
          40%, 60% { transform: translateX(8px); }
        }
      `}</style>
    </div>
  );
}

function Keypad({ onDigit, onBackspace, disabled }: { onDigit: (d: string) => void; onBackspace: () => void; disabled?: boolean }) {
  const rows = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']];
  return (
    <div className="grid grid-cols-3 gap-3">
      {rows.flat().map((d) => (
        <button
          key={d}
          type="button"
          disabled={disabled}
          onClick={() => onDigit(d)}
          className="rounded-2xl bg-slate-800 py-5 text-2xl font-black text-white transition hover:bg-slate-700 active:scale-95 disabled:opacity-50 sm:text-3xl"
        >
          {d}
        </button>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={onBackspace}
        className="grid place-items-center rounded-2xl bg-slate-800 py-5 text-white transition hover:bg-slate-700 active:scale-95 disabled:opacity-50"
        aria-label="Effacer"
      >
        <Delete size={22} />
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onDigit('0')}
        className="rounded-2xl bg-slate-800 py-5 text-2xl font-black text-white transition hover:bg-slate-700 active:scale-95 disabled:opacity-50 sm:text-3xl"
      >
        0
      </button>
      <span />
    </div>
  );
}
