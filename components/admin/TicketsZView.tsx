'use client';
import { useCallback, useEffect, useState } from 'react';
import { Download, Eye, Printer, RefreshCw, X } from 'lucide-react';

type Session = { id: string; terminalId: string; cashierId: string; terminalName: string; cashierName: string; openedAt: string; closedAt: string | null; openingCashMinor: number; closingNote: string | null; report: Record<string, unknown> };
type Day = { date: string; number: string; status: 'OPEN' | 'CLOSED'; closedAt: string | null; totals: Record<string, number>; payments: Record<string, number>; sessions: Session[]; openSessionCount: number; firstReceiptNumber: number | null; lastReceiptNumber: number | null };
const money = (n: number | undefined) => `${((n ?? 0) / 1000).toFixed(3)} DT`;
const time = (s: string | null) => s ? new Date(s).toLocaleString('fr-TN', { timeZone: 'Africa/Tunis' }) : 'En cours';
const methods: Record<string, string> = { CASH: 'Espèces', CARD: 'Carte', BANK_TRANSFER: 'Virement', OTHER: 'Autre' };

export default function TicketsZView() {
  const [days, setDays] = useState<Day[]>([]);
  const [selected, setSelected] = useState<Day | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [terminal, setTerminal] = useState('');
  const [cashier, setCashier] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/admin/pos/tickets-z?${new URLSearchParams({ from, to })}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Chargement impossible');
      setDays(data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); }
    finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => { void load(); }, [load]);
  const sessions = days.flatMap((d) => d.sessions);
  const terminals = [...new Map(sessions.map((s) => [s.terminalId, s.terminalName])).entries()];
  const cashiers = [...new Map(sessions.map((s) => [s.cashierId, s.cashierName])).entries()];
  const visible = days.filter((d) => d.sessions.some((s) => (!terminal || s.terminalId === terminal) && (!cashier || s.cashierId === cashier)));
  async function closeDay() {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/admin/pos/tickets-z/${selected.date}/close`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Clôture impossible');
      setSelected(data); setConfirmClose(false); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); }
    finally { setBusy(false); }
  }
  const actions = (day: Day) => day.status === 'CLOSED' && <>
    <a aria-label={`Télécharger le PDF du ${day.date}`} className="btn-ghost inline-flex items-center gap-1 text-xs" href={`/api/admin/pos/tickets-z/${day.date}/pdf?download=1`}><Download size={15} /> PDF</a>
    <a aria-label={`Imprimer le Ticket Z du ${day.date}`} className="btn-ghost inline-flex items-center gap-1 text-xs" href={`/api/admin/pos/tickets-z/${day.date}/pdf`} target="_blank" rel="noreferrer"><Printer size={15} /> Imprimer</a>
  </>;
  return <div className="p-4 sm:p-8">
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-black">Tickets Z</h1><p className="mt-1 text-sm text-ink-700">Une archive quotidienne consolidée, tous terminaux et caissiers confondus.</p></div><button className="btn-ghost flex items-center gap-2" onClick={load}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualiser</button></header>
    <div className="mb-5 flex flex-wrap gap-3 rounded-2xl border border-ink-200 bg-white p-4">
      <label className="text-xs font-bold">Du<input type="date" className="input mt-1" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label className="text-xs font-bold">Au<input type="date" className="input mt-1" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      <label className="text-xs font-bold">Terminal<select className="input mt-1" value={terminal} onChange={(e) => setTerminal(e.target.value)}><option value="">Tous</option>{terminals.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="text-xs font-bold">Caissier<select className="input mt-1" value={cashier} onChange={(e) => setCashier(e.target.value)}><option value="">Tous</option>{cashiers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
    </div>
    {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}
    <p className="mb-3 text-xs text-ink-500">Les filtres sélectionnent les journées concernées. Les totaux restent ceux de la journée entière. Fonds et comptages cumulés par session.</p>
    <div className="overflow-x-auto rounded-2xl border border-ink-200 bg-white"><table className="w-full whitespace-nowrap text-left text-sm"><thead className="bg-ink-100 text-xs uppercase"><tr>{['Date', 'Statut', 'CA net', 'Espèces nettes', 'Carte nette', 'Fonds', 'Compté', 'Écart', 'Actions'].map((h) => <th className="px-4 py-3" key={h}>{h}</th>)}</tr></thead><tbody>
      {visible.map((d) => <tr key={d.date} className="border-t border-ink-200"><td className="px-4 py-4 font-bold">{d.date}</td><td className="px-4 py-4"><span className={`rounded-full px-2 py-1 text-xs font-bold ${d.status === 'CLOSED' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{d.status === 'CLOSED' ? 'Définitif' : 'Provisoire'}</span></td>{[d.totals.netSalesMinor, d.payments.CASH, d.payments.CARD, d.totals.openingCashMinor].map((v, i) => <td key={i} className="px-4 py-4 tabular-nums">{money(v)}</td>)}<td className="px-4 py-4">{d.openSessionCount ? 'En cours' : money(d.totals.countedCashMinor)}</td><td className="px-4 py-4 font-bold">{d.openSessionCount ? '—' : money(d.totals.cashDifferenceMinor)}</td><td className="px-4 py-4"><div className="flex gap-1"><button className="btn-ghost inline-flex items-center gap-1 text-xs" onClick={() => { setSelected(d); setConfirmClose(false); }}><Eye size={15} /> Voir</button>{actions(d)}</div></td></tr>)}
      {!visible.length && <tr><td colSpan={9} className="p-8 text-center text-ink-500">{loading ? 'Chargement…' : 'Aucune journée sur cette période.'}</td></tr>}
    </tbody></table></div>
    {selected && <div className="fixed inset-0 z-50 bg-slate-900/40" onClick={() => setSelected(null)}><section role="dialog" aria-modal="true" aria-labelledby="z-title" className="ml-auto h-full w-full max-w-3xl overflow-y-auto bg-white p-6 shadow-xl sm:p-8" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') setSelected(null); }}>
      <header className="mb-6 flex justify-between"><div><h2 id="z-title" className="text-2xl font-black">TICKET Z · {selected.date}</h2><p className="text-sm text-ink-500">{selected.number} · {selected.status === 'CLOSED' ? `Clôturé le ${time(selected.closedAt)}` : 'Journée provisoire'}</p></div><button autoFocus className="p-2" aria-label="Fermer" onClick={() => setSelected(null)}><X /></button></header>
      <div className="mb-5 flex gap-2">{actions(selected)}</div>
      {error && <p role="alert" className="mb-4 text-red-700">{error}</p>}
      {selected.status === 'OPEN' && <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"><p>{selected.openSessionCount ? `${selected.openSessionCount} session(s) encore ouverte(s).` : 'Toutes les sessions sont fermées. Vous pouvez finaliser cette journée.'}</p>{!selected.openSessionCount && (confirmClose ? <><p className="my-3 font-semibold">La clôture fige les chiffres et empêche toute nouvelle ouverture de caisse pour cette date.</p><button disabled={busy} className="btn-primary" onClick={closeDay}>{busy ? 'Clôture…' : 'Confirmer la clôture définitive'}</button></> : <button className="btn-primary mt-3" onClick={() => setConfirmClose(true)}>Clôturer la journée</button>)}</div>}
      <h3 className="mb-3 font-black">Résumé</h3><dl className="mb-6 grid grid-cols-2 gap-3">{[['Ventes brutes', 'grossSalesMinor'], ['Remises et offres', 'discountsMinor'], ['Retours / annulations', 'refundsMinor'], ['Ventes nettes', 'netSalesMinor']].map(([label, key]) => <div className="rounded-xl border border-ink-200 p-3" key={key}><dt className="text-xs text-ink-500">{label}</dt><dd className="mt-1 text-lg font-bold">{money(selected.totals[key])}</dd></div>)}</dl>
      <h3 className="mb-3 font-black">Paiements nets</h3><dl className="mb-6 space-y-2">{Object.entries(selected.payments).map(([method, value]) => <div className="flex justify-between" key={method}><dt>{methods[method] ?? method}</dt><dd className="font-bold">{money(value)}</dd></div>)}</dl>
      <h3 className="mb-3 font-black">Espèces et écarts</h3><dl className="mb-6 space-y-2">{[['Fonds initiaux cumulés', 'openingCashMinor'], ['Ventes espèces', 'cashSalesMinor'], ['Retours espèces', 'cashRefundsMinor'], ['Entrées manuelles', 'cashMovementsAddMinor'], ['Sorties manuelles', 'cashMovementsRemoveMinor'], ['Solde théorique cumulé', 'expectedCashMinor'], ['Comptages cumulés', 'countedCashMinor'], ['Écart', 'cashDifferenceMinor']].map(([label, key]) => <div className="flex justify-between" key={key}><dt>{label}</dt><dd className="font-bold">{money(selected.totals[key])}</dd></div>)}</dl>
      <p className="mb-6 text-sm">{selected.totals.transactionCount} tickets · Panier moyen {money(selected.totals.averageTicketMinor)} · Premier / dernier : {selected.firstReceiptNumber ?? '—'} / {selected.lastReceiptNumber ?? '—'}</p>
      <h3 className="mb-3 font-black">Sessions, caissiers et ventes</h3>{selected.sessions.map((s) => <details key={s.id} className="mb-3 rounded-xl border border-ink-200 p-4"><summary className="cursor-pointer font-bold">{s.terminalName} · {s.cashierName}<span className="mt-1 block text-xs font-normal text-ink-500">{time(s.openedAt)} → {time(s.closedAt)}</span></summary><p className="my-3 text-sm">Fond {money(s.openingCashMinor)} · Écart {money(Number(s.report.cashDifferenceMinor ?? 0))}</p>{s.closingNote && <p className="mb-3 text-sm">Note : {s.closingNote}</p>}{((s.report.details as { sales?: { id: string; number: number; totalMinor: number; status: string }[] } | undefined)?.sales ?? []).map((sale) => <div key={sale.id} className="flex justify-between border-t py-2 text-sm"><span>Ticket #{sale.number} · {sale.status === 'CANCELLED' ? 'Annulé / remboursé' : 'Encaissé'}</span><span>{money(sale.totalMinor)}</span></div>)}</details>)}
    </section></div>}
  </div>;
}
