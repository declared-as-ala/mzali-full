'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  Filter,
  Monitor,
  Printer,
  Receipt,
  RefreshCw,
  User,
  Wallet,
  X,
} from 'lucide-react';

type Session = {
  id: string;
  terminalId: string;
  cashierId: string;
  terminalName: string;
  cashierName: string;
  openedAt: string;
  closedAt: string | null;
  openingCashMinor: number;
  closingNote: string | null;
  report: Record<string, unknown>;
};

type Day = {
  date: string;
  number: string;
  status: 'OPEN' | 'CLOSED';
  closedAt: string | null;
  totals: Record<string, number>;
  payments: Record<string, number>;
  sessions: Session[];
  openSessionCount: number;
  firstReceiptNumber: number | null;
  lastReceiptNumber: number | null;
};

const money = (n: number | undefined) => `${((n ?? 0) / 1000).toFixed(3)} DT`;
const time = (s: string | null) =>
  s ? new Date(s).toLocaleString('fr-TN', { timeZone: 'Africa/Tunis' }) : 'En cours';
const methods: Record<string, string> = {
  CASH: 'Espèces',
  CARD: 'Carte bancaire',
  BANK_TRANSFER: 'Virement',
  OTHER: 'Autre',
};

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
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/pos/tickets-z?${new URLSearchParams({ from, to })}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Chargement impossible');
      setDays(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const sessions = days.flatMap((d) => d.sessions);
  const terminals = [...new Map(sessions.map((s) => [s.terminalId, s.terminalName])).entries()];
  const cashiers = [...new Map(sessions.map((s) => [s.cashierId, s.cashierName])).entries()];

  const visible = days.filter((d) =>
    d.sessions.some(
      (s) => (!terminal || s.terminalId === terminal) && (!cashier || s.cashierId === cashier),
    ),
  );

  // Period aggregate KPIs
  const periodKpis = useMemo(() => {
    let netSales = 0;
    let cash = 0;
    let card = 0;
    let difference = 0;
    let ticketCount = 0;

    visible.forEach((d) => {
      netSales += d.totals.netSalesMinor ?? 0;
      cash += d.payments.CASH ?? 0;
      card += d.payments.CARD ?? 0;
      difference += d.totals.cashDifferenceMinor ?? 0;
      ticketCount += d.totals.transactionCount ?? 0;
    });

    return { netSales, cash, card, difference, ticketCount };
  }, [visible]);

  async function closeDay() {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/pos/tickets-z/${selected.date}/close`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Clôture impossible');
      setSelected(data);
      setConfirmClose(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  const actions = (day: Day) => (
    <div className="inline-flex items-center gap-1.5">
      <a
        aria-label={`Télécharger le PDF du ${day.date}`}
        className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
        href={`/api/admin/pos/tickets-z/${day.date}/pdf?download=1`}
      >
        <Download size={13} /> PDF
      </a>
      <a
        aria-label={`Imprimer le Ticket Z du ${day.date}`}
        title={
          day.status === 'OPEN'
            ? 'Imprimer un état provisoire, sans clôturer la journée'
            : 'Imprimer le Ticket Z définitif'
        }
        className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700 transition"
        href={`/api/admin/pos/tickets-z/${day.date}/pdf`}
        target="_blank"
        rel="noreferrer"
      >
        <Printer size={13} /> Imprimer
      </a>
    </div>
  );

  return (
    <div className="p-4 sm:p-8 space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900">Tickets Z (Rapports Journaliers)</h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Archives consolidées quotidiennes, réconciliation fiscale et impression thermique 80mm / A4 PDF.
          </p>
        </div>
        <button
          className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 shadow-xs transition"
          onClick={load}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualiser
        </button>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total CA Net</span>
          <p className="mt-1 text-lg font-black text-blue-700 tabular-nums">{money(periodKpis.netSales)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Espèces nettes</span>
          <p className="mt-1 text-lg font-black text-emerald-700 tabular-nums">{money(periodKpis.cash)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Carte bancaire</span>
          <p className="mt-1 text-lg font-black text-slate-900 tabular-nums">{money(periodKpis.card)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total écarts</span>
          <p
            className={`mt-1 text-lg font-black tabular-nums ${
              periodKpis.difference === 0
                ? 'text-slate-900'
                : periodKpis.difference < 0
                ? 'text-rose-600'
                : 'text-amber-600'
            }`}
          >
            {periodKpis.difference > 0 ? '+' : ''}
            {money(periodKpis.difference)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs col-span-2 sm:col-span-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tickets émis</span>
          <p className="mt-1 text-lg font-black text-slate-900 tabular-nums">{periodKpis.ticketCount}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
          <Filter size={14} /> Filtres
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Du</label>
            <input
              type="date"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Au</label>
            <input
              type="date"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Terminal</label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
              value={terminal}
              onChange={(e) => setTerminal(e.target.value)}
            >
              <option value="">Tous les terminaux</option>
              {terminals.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Caissier</label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
              value={cashier}
              onChange={(e) => setCashier(e.target.value)}
            >
              <option value="">Tous les caissiers</option>
              {cashiers.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">
          {error}
        </p>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full whitespace-nowrap text-left text-xs">
          <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-black uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3.5">Date</th>
              <th className="px-4 py-3.5">Statut</th>
              <th className="px-4 py-3.5">CA Net</th>
              <th className="px-4 py-3.5">Espèces nettes</th>
              <th className="px-4 py-3.5">Carte bancaire</th>
              <th className="px-4 py-3.5">Fonds initiaux</th>
              <th className="px-4 py-3.5">Comptage réel</th>
              <th className="px-4 py-3.5">Écart</th>
              <th className="px-4 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map((d) => {
              const diff = d.totals.cashDifferenceMinor ?? 0;
              const hasDifference = d.totals.countedCashMinor !== null && diff !== 0;

              return (
                <tr key={d.date} className="hover:bg-slate-50/80 transition">
                  <td className="px-4 py-3.5 font-bold text-slate-900">{d.date}</td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black ${
                        d.status === 'CLOSED'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          d.status === 'CLOSED' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                        }`}
                      />
                      {d.status === 'CLOSED' ? 'Définitif' : 'Provisoire (en cours)'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 font-black text-blue-700 tabular-nums">
                    {money(d.totals.netSalesMinor)}
                  </td>
                  <td className="px-4 py-3.5 font-bold text-emerald-700 tabular-nums">
                    {money(d.payments.CASH)}
                  </td>
                  <td className="px-4 py-3.5 font-semibold text-slate-700 tabular-nums">
                    {money(d.payments.CARD)}
                  </td>
                  <td className="px-4 py-3.5 font-medium text-slate-600 tabular-nums">
                    {money(d.totals.openingCashMinor)}
                  </td>
                  <td className="px-4 py-3.5 font-semibold text-slate-800 tabular-nums">
                    {d.openSessionCount ? (
                      <span className="text-amber-700 italic">Sessions ouvertes ({d.openSessionCount})</span>
                    ) : (
                      money(d.totals.countedCashMinor)
                    )}
                  </td>
                  <td className="px-4 py-3.5 font-bold tabular-nums">
                    {d.openSessionCount ? (
                      '—'
                    ) : (
                      <span className={diff === 0 ? 'text-slate-800' : diff < 0 ? 'text-rose-600' : 'text-amber-600'}>
                        {diff > 0 ? '+' : ''}
                        {money(diff)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                        onClick={() => {
                          setSelected(d);
                          setConfirmClose(false);
                        }}
                      >
                        <Eye size={13} /> Consulter
                      </button>
                      {actions(d)}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!visible.length && (
              <tr>
                <td colSpan={9} className="p-8 text-center text-xs text-slate-400">
                  {loading ? 'Chargement des Tickets Z…' : 'Aucune journée trouvée sur cette période.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Day Details Drawer */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
          onClick={() => setSelected(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="z-title"
            className="flex flex-col h-[90vh] w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl border border-slate-100"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setSelected(null);
            }}
          >
            {/* Drawer Header */}
            <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-4">
              <div>
                <h2 id="z-title" className="text-xl font-black text-slate-900">
                  Ticket Z Journalier · {selected.date}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selected.number} · {selected.status === 'CLOSED' ? `Clôturé le ${time(selected.closedAt)}` : 'Journée provisoire'}
                </p>
              </div>
              <button
                autoFocus
                className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-200/60 transition"
                aria-label="Fermer"
                onClick={() => setSelected(null)}
              >
                <X size={18} />
              </button>
            </header>

            {/* Actions Bar */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-white px-6 py-3">
              <div className="flex gap-2">{actions(selected)}</div>
              <span className="text-xs font-bold text-slate-500">
                {selected.totals.transactionCount} ticket(s) émis
              </span>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {error && (
                <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">
                  {error}
                </p>
              )}

              {/* Day Closure Banner */}
              {selected.status === 'OPEN' && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs space-y-2">
                  <p className="font-bold text-amber-900">
                    {selected.openSessionCount
                      ? `${selected.openSessionCount} session(s) encore en cours.`
                      : 'Toutes les sessions de cette journée sont closes.'}
                  </p>
                  {!selected.openSessionCount &&
                    (confirmClose ? (
                      <div className="space-y-3 pt-2">
                        <p className="text-amber-800">
                          La clôture fige définitivement les chiffres fiscaux de la date.
                        </p>
                        <button
                          disabled={busy}
                          className="rounded-xl bg-slate-900 px-4 py-2.5 font-bold text-white hover:bg-slate-800 disabled:opacity-40"
                          onClick={closeDay}
                        >
                          {busy ? 'Clôture en cours…' : 'Confirmer la clôture définitive'}
                        </button>
                      </div>
                    ) : (
                      <button
                        className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white hover:bg-slate-800"
                        onClick={() => setConfirmClose(true)}
                      >
                        Clôturer définitivement la journée
                      </button>
                    ))}
                </div>
              )}

              {/* Sales Summary Grid */}
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">
                  Résumé des ventes consolidées
                </h3>
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5">
                    <dt className="text-slate-500 font-medium">Ventes brutes</dt>
                    <dd className="mt-1 text-base font-black text-slate-900">{money(selected.totals.grossSalesMinor)}</dd>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5">
                    <dt className="text-slate-500 font-medium">Remises accordées</dt>
                    <dd className="mt-1 text-base font-black text-rose-600">-{money(selected.totals.discountsMinor)}</dd>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5">
                    <dt className="text-slate-500 font-medium">Retours / Annulations</dt>
                    <dd className="mt-1 text-base font-black text-rose-600">-{money(selected.totals.refundsMinor)}</dd>
                  </div>
                  <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3.5">
                    <dt className="text-blue-800 font-bold uppercase text-[10px]">Ventes nettes</dt>
                    <dd className="mt-1 text-base font-black text-blue-900">{money(selected.totals.netSalesMinor)}</dd>
                  </div>
                </dl>
              </div>

              {/* Payments Breakdown */}
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">
                  Ventilation par moyen de paiement
                </h3>
                <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-slate-50/50 p-3 text-xs">
                  {Object.entries(selected.payments).map(([method, value]) => (
                    <div className="flex justify-between py-2" key={method}>
                      <dt className="font-medium text-slate-700">{methods[method] ?? method}</dt>
                      <dd className="font-black text-slate-900 tabular-nums">{money(value)}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Cash Reconciliation */}
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">
                  Réconciliation des espèces
                </h3>
                <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-slate-50/50 p-3 text-xs">
                  {[
                    ['Fonds initiaux cumulés', 'openingCashMinor'],
                    ['Ventes espèces', 'cashSalesMinor'],
                    ['Retours espèces', 'cashRefundsMinor'],
                    ['Entrées manuelles', 'cashMovementsAddMinor'],
                    ['Sorties manuelles', 'cashMovementsRemoveMinor'],
                    ['Solde théorique cumulé', 'expectedCashMinor'],
                    ['Comptages réels cumulés', 'countedCashMinor'],
                    ['Écart de caisse global', 'cashDifferenceMinor'],
                  ].map(([label, key]) => (
                    <div
                      className={`flex justify-between py-2 ${
                        label.includes('Écart') ? 'font-black text-sm bg-slate-100/60 -mx-1 px-1 rounded-lg' : ''
                      }`}
                      key={key}
                    >
                      <dt className="text-slate-700">{label}</dt>
                      <dd className="font-bold text-slate-900 tabular-nums">{money(selected.totals[key])}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Individual Sessions Breakdown */}
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">
                  Sessions de la journée ({selected.sessions.length})
                </h3>
                <div className="space-y-3">
                  {selected.sessions.map((s) => (
                    <details
                      key={s.id}
                      className="group rounded-2xl border border-slate-200 bg-white p-4 text-xs transition"
                    >
                      <summary className="flex cursor-pointer items-center justify-between font-bold text-slate-900">
                        <div>
                          <span>
                            {s.terminalName} · {s.cashierName}
                          </span>
                          <span className="block text-[11px] font-normal text-slate-500 mt-0.5">
                            {time(s.openedAt)} → {time(s.closedAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-700">
                            Fond : {money(s.openingCashMinor)}
                          </span>
                          <a
                            href={`/api/admin/pos/sessions/${s.id}/pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg bg-slate-100 p-1 text-slate-600 hover:bg-slate-200"
                            title="Télécharger Ticket Z de cette session"
                          >
                            <Download size={13} />
                          </a>
                        </div>
                      </summary>

                      <div className="mt-3 border-t border-slate-100 pt-3 text-slate-600 space-y-1">
                        <p>
                          Écart session :{' '}
                          <strong className="text-slate-900">
                            {money(Number(s.report.cashDifferenceMinor ?? 0))}
                          </strong>
                        </p>
                        {s.closingNote && (
                          <p className="italic text-slate-500">Note de clôture : {s.closingNote}</p>
                        )}
                        <div className="pt-2">
                          <span className="font-bold text-slate-700">Tickets de cette session :</span>
                          <div className="mt-1 divide-y divide-slate-100">
                            {((s.report.details as { sales?: { id: string; number: number; totalMinor: number; status: string }[] } | undefined)?.sales ?? []).map((sale) => (
                              <div key={sale.id} className="flex justify-between py-1 text-[11px]">
                                <span>
                                  Ticket #{sale.number} · {sale.status === 'CANCELLED' ? 'Annulé' : 'Encaissé'}
                                </span>
                                <span className="font-bold tabular-nums">{money(sale.totalMinor)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}