'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet, X } from 'lucide-react';
import { posFetch } from '@/lib/device';
import { formatMinor } from '@/lib/money';
import type { PosCashierSession } from '@/types/pos';

export default function CashSummary() {
  const router = useRouter();
  const [session, setSession] = useState<PosCashierSession | null>(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let active = true;
    let sequence = 0;
    const refresh = async () => {
      const request = ++sequence;
      try {
        const res = await posFetch('/api/sessions', { cache: 'no-store' });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Solde indisponible');
        if (!active || request !== sequence) return;
        setError('');
        setSession(body.session);
        if (!body.session) router.replace('/sessions/open');
      } catch (e) { if (active && request === sequence) setError(e instanceof Error ? e.message : 'Solde indisponible'); }
    };
    void refresh();
    const timer = setInterval(refresh, 15000);
    window.addEventListener('pos-cash-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('pos-cash-changed', refresh); window.removeEventListener('focus', refresh); };
  }, [router]);
  if (error) return <span role="alert" className="max-w-64 text-xs font-semibold text-red-700">{error}</span>;
  if (!session) return <span className="text-xs text-slate-500">Chargement caisse…</span>;
  const rows: [string, number][] = [
    ['Fond initial', session.openingCashMinor], ['Ventes espèces', session.cashSalesMinor],
    ['Retours espèces', -session.cashRefundsMinor], ['Entrées manuelles', session.cashMovementsAddMinor],
    ['Sorties manuelles', -session.cashMovementsRemoveMinor], ['Solde attendu', session.expectedCashMinor],
  ];
  return <>
    <button onClick={() => setExpanded(true)} className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-xs text-emerald-900" aria-label="Détail du solde de caisse">
      <Wallet size={18} /><span>Fond : {formatMinor(session.openingCashMinor)}<strong className="block">Caisse : {formatMinor(session.expectedCashMinor)}</strong></span>
    </button>
    {expanded && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setExpanded(false)}>
      <section role="dialog" aria-modal="true" aria-labelledby="cash-summary-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') setExpanded(false); }}>
        <div className="flex items-center justify-between"><h2 id="cash-summary-title" className="text-lg font-bold">Informations caisse</h2><button autoFocus onClick={() => setExpanded(false)} aria-label="Fermer" className="p-3"><X size={20} /></button></div>
        <p className="mb-5 text-sm text-slate-500">Caisse ouverte depuis {new Date(session.openedAt).toLocaleString('fr-TN', { timeZone: 'Africa/Tunis' })}</p>
        <dl className="space-y-3">{rows.map(([label, value]) => <div key={label} className="flex justify-between gap-4 border-b border-slate-100 pb-2 text-sm"><dt>{label}</dt><dd className="font-semibold tabular-nums">{formatMinor(value)}</dd></div>)}</dl>
      </section>
    </div>}
  </>;
}
