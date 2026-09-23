'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Delete, CheckCircle2, AlertTriangle, Clock, Plus, LogOut, X } from 'lucide-react';

type ActiveEntry = { employeeId: string; firstName: string; lastName: string; clockIn: string };

type AddScreen =
  | { name: 'pin' }
  | { name: 'loading' }
  | { name: 'ready_to_start'; employeeName: string }
  | { name: 'already_in'; employeeName: string }
  | { name: 'blocked' }
  | { name: 'success'; employeeName: string; clockIn: string };

const MAX_PIN_LENGTH = 6;
const AUTO_RESET_MS = 2500;

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Tunis' });
}
function elapsedLabel(clockIn: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - new Date(clockIn).getTime()) / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export default function PointagePage() {
  const [active, setActive] = useState<ActiveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [addOpen, setAddOpen] = useState(false);
  const [leaving, setLeaving] = useState<ActiveEntry | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/pointage/active', { cache: 'no-store' });
      if (res.ok) setActive(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  async function confirmLeave() {
    if (!leaving) return;
    const employeeId = leaving.employeeId;
    setLeaving(null);
    setActive((prev) => prev.filter((e) => e.employeeId !== employeeId));
    try {
      await fetch(`/api/pointage/${employeeId}/clock-out`, { method: 'POST' });
    } finally {
      refresh();
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-white sm:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Mzali Boutique</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Pointage</h1>
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3.5 text-sm font-black text-slate-950 transition hover:bg-emerald-400"
          >
            <Plus size={18} /> Pointer
          </button>
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-900" />)}
          </div>
        ) : !active.length ? (
          <div className="rounded-3xl border border-dashed border-slate-800 bg-slate-900/50 p-12 text-center">
            <Clock size={32} className="mx-auto mb-3 text-slate-600" />
            <p className="font-bold text-slate-400">Personne n&apos;est en session actuellement.</p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {active.map((e) => (
              <li key={e.employeeId} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <div className="min-w-0">
                  <p className="truncate text-base font-black">{e.firstName} {e.lastName}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                    Depuis {formatClock(e.clockIn)} · {elapsedLabel(e.clockIn, now)}
                  </p>
                </div>
                <button
                  onClick={() => setLeaving(e)}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-rose-500/15 px-3.5 py-2.5 text-xs font-black text-rose-400 transition hover:bg-rose-500/25"
                >
                  <LogOut size={15} /> Sortir
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {addOpen && <AddPinModal onClose={() => setAddOpen(false)} onClockedIn={() => { setAddOpen(false); refresh(); }} />}

      {leaving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" onClick={() => setLeaving(null)}>
          <div className="w-full max-w-xs rounded-3xl border border-slate-800 bg-slate-900 p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-black">Confirmer la sortie</p>
            <p className="mt-1 text-sm text-slate-400">{leaving.firstName} {leaving.lastName}</p>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setLeaving(null)} className="flex-1 rounded-2xl bg-slate-800 py-3 text-sm font-bold text-slate-300 hover:bg-slate-700">Annuler</button>
              <button onClick={confirmLeave} className="flex-1 rounded-2xl bg-rose-500 py-3 text-sm font-black text-white hover:bg-rose-400">Sortir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddPinModal({ onClose, onClockedIn }: { onClose: () => void; onClockedIn: () => void }) {
  const [screen, setScreen] = useState<AddScreen>({ name: 'pin' });
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (resetTimerRef.current) clearTimeout(resetTimerRef.current); }, []);

  useEffect(() => {
    if (screen.name === 'success' || screen.name === 'already_in' || screen.name === 'blocked') {
      resetTimerRef.current = setTimeout(onClose, AUTO_RESET_MS);
      return () => { if (resetTimerRef.current) clearTimeout(resetTimerRef.current); };
    }
  }, [screen, onClose]);

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
      const idRes = await fetch('/api/pointage/identify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }),
      });
      const idData = await idRes.json();
      if (!idData?.ok) {
        setShake(true);
        setTimeout(() => setShake(false), 400);
        setPinError('Code PIN incorrect.');
        setPin('');
        setScreen({ name: 'pin' });
        setBusy(false);
        return;
      }
      if (idData.status === 'ready_to_end') {
        setScreen({ name: 'already_in', employeeName: idData.employee.firstName });
        setBusy(false);
        return;
      }
      if (idData.status === 'blocked_stale_session') {
        setScreen({ name: 'blocked' });
        setBusy(false);
        return;
      }
      const ciRes = await fetch('/api/pointage/clock-in', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }),
      });
      const ciData = await ciRes.json();
      if (ciData?.ok) {
        setScreen({ name: 'success', employeeName: ciData.employee.firstName, clockIn: ciData.session.clockIn });
        onClockedIn();
      } else {
        setPinError(ciData?.error || 'Erreur — réessayez.');
        setScreen({ name: 'pin' });
      }
      setBusy(false);
    } catch {
      setPinError('Erreur réseau — réessayez.');
      setPin('');
      setScreen({ name: 'pin' });
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl sm:p-8" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="mb-2 ml-auto flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-slate-400 hover:bg-slate-700" aria-label="Fermer">
          <X size={16} />
        </button>

        {screen.name === 'pin' && (
          <div className={shake ? 'animate-[shake_0.4s]' : ''}>
            <p className="mb-5 text-center text-base font-bold text-slate-300 sm:text-lg">Entrez votre code PIN</p>
            <div className="mb-6 flex items-center justify-center gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <span key={i} className={`h-4 w-4 rounded-full border-2 transition-colors sm:h-5 sm:w-5 ${i < pin.length ? 'border-emerald-400 bg-emerald-400' : 'border-slate-700 bg-transparent'}`} />
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

        {screen.name === 'already_in' && (
          <div className="text-center py-6">
            <AlertTriangle size={40} className="mx-auto mb-4 text-amber-400" />
            <p className="text-lg font-bold text-amber-300">{screen.employeeName} est déjà en session.</p>
            <p className="mt-1 text-sm text-slate-400">Utilisez « Sortir » dans la liste pour terminer.</p>
          </div>
        )}

        {screen.name === 'blocked' && (
          <div className="text-center py-6">
            <AlertTriangle size={40} className="mx-auto mb-4 text-amber-400" />
            <p className="text-lg font-bold text-amber-300">Une session précédente n&apos;a pas été clôturée. Veuillez contacter l&apos;administrateur.</p>
          </div>
        )}

        {screen.name === 'success' && (
          <div className="text-center py-6">
            <CheckCircle2 size={48} className="mx-auto mb-4 text-emerald-400" />
            <p className="text-xl font-black text-emerald-400">Pointage enregistré</p>
            <p className="mt-1 text-sm text-slate-400">{screen.employeeName}</p>
            <p className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-500">Début</p>
            <p className="font-mono text-2xl font-black">{formatClock(screen.clockIn)}</p>
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
        <button key={d} type="button" disabled={disabled} onClick={() => onDigit(d)} className="rounded-2xl bg-slate-800 py-5 text-2xl font-black text-white transition hover:bg-slate-700 active:scale-95 disabled:opacity-50 sm:text-3xl">
          {d}
        </button>
      ))}
      <button type="button" disabled={disabled} onClick={onBackspace} className="grid place-items-center rounded-2xl bg-slate-800 py-5 text-white transition hover:bg-slate-700 active:scale-95 disabled:opacity-50" aria-label="Effacer">
        <Delete size={22} />
      </button>
      <button type="button" disabled={disabled} onClick={() => onDigit('0')} className="rounded-2xl bg-slate-800 py-5 text-2xl font-black text-white transition hover:bg-slate-700 active:scale-95 disabled:opacity-50 sm:text-3xl">
        0
      </button>
      <span />
    </div>
  );
}
