'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownRight, ArrowUpRight, Clock, ShieldAlert, User, Wallet, X } from 'lucide-react';
import { posFetch } from '@/lib/device';
import { formatMinor } from '@/lib/money';
import type { CurrentSessionResponse, PosCashierSession } from '@/types/pos';

export default function CashSummary({
  onOpenMovements,
}: {
  onOpenMovements?: () => void;
}) {
  const router = useRouter();
  const [session, setSession] = useState<PosCashierSession | null>(null);
  const [otherCashier, setOtherCashier] = useState<CurrentSessionResponse['activeSessionOtherCashier'] | null>(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    let sequence = 0;
    const refresh = async () => {
      const request = ++sequence;
      try {
        const res = await posFetch('/api/sessions', { cache: 'no-store' });
        const body: CurrentSessionResponse & { error?: string } = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Solde indisponible');
        if (!active || request !== sequence) return;
        setError('');
        setSession(body.session ?? null);
        setOtherCashier(body.activeSessionOtherCashier ?? null);
        if (!body.session && !body.activeSessionOtherCashier) {
          router.replace('/sessions/open');
        }
      } catch (e) {
        if (active && request === sequence) {
          setError(e instanceof Error ? e.message : 'Solde indisponible');
        }
      }
    };
    void refresh();
    const timer = setInterval(refresh, 15000);
    window.addEventListener('pos-cash-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('pos-cash-changed', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [router]);

  if (otherCashier) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800">
        <ShieldAlert size={14} className="text-amber-600 flex-none" />
        <span className="truncate">Session active par {otherCashier.cashierName}</span>
      </div>
    );
  }

  if (error) {
    return <span role="alert" className="max-w-64 text-xs font-semibold text-rose-700">{error}</span>;
  }

  if (!session) {
    return <span className="text-xs text-slate-500">Chargement caisse…</span>;
  }

  const rows: { label: string; value: number; sign?: '+' | '-' }[] = [
    { label: 'Fond initial', value: session.openingCashMinor },
    { label: 'Ventes espèces', value: session.cashSalesMinor, sign: '+' },
    { label: 'Retours espèces', value: session.cashRefundsMinor, sign: '-' },
    { label: 'Entrées de caisse (manuel)', value: session.cashMovementsAddMinor, sign: '+' },
    { label: 'Sorties de caisse (dépenses)', value: session.cashMovementsRemoveMinor, sign: '-' },
    { label: 'Espèces théoriques en caisse', value: session.expectedCashMinor },
  ];

  return (
    <>
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3 py-1.5 text-left text-xs font-bold text-emerald-900 transition hover:bg-emerald-100/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 shadow-xs"
        aria-label="Détail du solde de caisse"
        type="button"
      >
        <Wallet size={15} className="flex-none text-emerald-700 hidden sm:block" />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] text-emerald-800 font-semibold">
            <span className="hidden sm:inline">Fond: {formatMinor(session.openingCashMinor)}</span>
            <span className="hidden md:inline text-emerald-400">·</span>
            <span className="hidden md:inline">#{session.id.slice(-6).toUpperCase()}</span>
          </div>
          <strong className="block truncate text-xs sm:text-sm font-black text-emerald-950">
            Caisse : {formatMinor(session.expectedCashMinor)}
          </strong>
        </div>
      </button>

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
          onClick={() => setExpanded(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="cash-summary-title"
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-100"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Escape') setExpanded(false); }}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
                  <Wallet size={20} />
                </div>
                <div>
                  <h2 id="cash-summary-title" className="text-base font-black text-slate-900">
                    Situation du tiroir-caisse
                  </h2>
                  <p className="text-xs text-slate-500">
                    Session #{session.id.slice(-6).toUpperCase()} · {session.terminalName || session.terminalId}
                  </p>
                </div>
              </div>
              <button
                autoFocus
                onClick={() => setExpanded(false)}
                aria-label="Fermer"
                className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-50 p-3.5 text-xs text-slate-600 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <User size={13} className="text-slate-400" />
                <span>Caissier : <strong className="text-slate-900">{session.cashierName || session.cashierId}</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock size={13} className="text-slate-400" />
                <span>
                  Ouverte le {new Date(session.openedAt).toLocaleDateString('fr-TN')} à{' '}
                  {new Date(session.openedAt).toLocaleTimeString('fr-TN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>

            <dl className="mt-4 divide-y divide-slate-100 text-sm">
              {rows.map(({ label, value, sign }) => (
                <div
                  key={label}
                  className={`flex items-center justify-between py-2.5 ${
                    label.includes('théoriques') ? 'bg-emerald-50/80 -mx-2 px-2 rounded-xl font-black text-emerald-900' : 'text-slate-700'
                  }`}
                >
                  <dt className="text-xs font-semibold">{label}</dt>
                  <dd className="font-bold tabular-nums">
                    {sign ? `${sign} ` : ''}
                    {formatMinor(value)}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-6 flex flex-col sm:flex-row gap-2">
              {onOpenMovements && (
                <button
                  type="button"
                  onClick={() => {
                    setExpanded(false);
                    onOpenMovements();
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 py-2.5 text-xs font-black text-blue-700 hover:bg-blue-100 transition"
                >
                  <ArrowDownRight size={14} /> Mouvement de caisse
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setExpanded(false);
                  router.push('/sessions/close');
                }}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 py-2.5 text-xs font-black text-amber-800 hover:bg-amber-100 transition"
              >
                Clôturer la session
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}