'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  Filter,
  Monitor,
  Printer,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { useToast } from './Toast';
import { formatDateTime } from '@/lib/site-config';

type PosCashierSession = {
  id: string;
  cashierId: string;
  terminalId: string;
  cashierName?: string;
  terminalName?: string;
  openingCashMinor: number;
  expectedCashMinor: number;
  openedAt: string;
  closedAt: string | null;
  closingCountedCashMinor: number | null;
  status: 'OPEN' | 'CLOSED';
  grossSalesMinor: number;
  discountsMinor: number;
  cashSalesMinor: number;
  cardSalesMinor: number;
  otherSalesMinor: number;
  transactionCount: number;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
};

type PosSessionReport = {
  type: 'X' | 'Z';
  generatedAt: string;
  expectedCashMinor: number;
  countedCashMinor: number | null;
  cashDifferenceMinor: number | null;
  flagged: boolean;
  grossSalesMinor: number;
  refundsMinor: number;
  discountsMinor: number;
  netSalesMinor: number;
  cashSalesMinor: number;
  cardSalesMinor: number;
  otherSalesMinor: number;
  cashMovementsAddMinor: number;
  cashMovementsRemoveMinor: number;
  transactionCount: number;
  details?: {
    openingCashMinor?: number;
    sales?: { id: string; number: number; totalMinor: number; status: string; createdAt: string }[];
    movements?: PosCashMovementItem[];
  };
};

type PosCashMovementItem = {
  _id?: string;
  id?: string;
  type: 'ADD' | 'REMOVE' | 'CASH_IN' | 'CASH_OUT';
  category?: string;
  categoryLabel?: string;
  beneficiary?: string;
  paymentMethod?: string;
  amountMinor: number;
  reason: string;
  performedByName?: string;
  createdAt: string;
};

type PosSaleItem = {
  _id: string;
  saleNumber: number;
  grossTotalMinor: number;
  finalTotalMinor: number;
  status: string;
  createdAt: string;
};

function formatMinor(minor: number): string {
  return `${(minor / 1000).toFixed(3)} DT`;
}

function exportSessionsCsv(sessions: PosCashierSession[]) {
  const rows = [
    'session_id,statut,terminal,caissier,ouverture,fermeture,fond_initial_dt,ventes_brutes_dt,tickets,solde_attendu_dt,compte_dt,ecart_dt,verifie_par',
    ...sessions.map((s) => {
      const diff = s.closingCountedCashMinor !== null ? (s.closingCountedCashMinor - s.expectedCashMinor) / 1000 : '';
      return [
        s.id,
        s.status,
        s.terminalName || s.terminalId,
        s.cashierName || s.cashierId,
        s.openedAt,
        s.closedAt ?? '',
        (s.openingCashMinor / 1000).toFixed(3),
        (s.grossSalesMinor / 1000).toFixed(3),
        s.transactionCount,
        (s.expectedCashMinor / 1000).toFixed(3),
        s.closingCountedCashMinor !== null ? (s.closingCountedCashMinor / 1000).toFixed(3) : '',
        diff,
        s.reviewedBy ?? '',
      ].join(',');
    }),
  ];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `sessions-caisse-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function PosSessionsView() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<PosCashierSession[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
  const [terminalFilter, setTerminalFilter] = useState<string>('ALL');
  const [cashierFilter, setCashierFilter] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Drawer / details modal
  const [selectedSession, setSelectedSession] = useState<PosCashierSession | null>(null);
  const [report, setReport] = useState<PosSessionReport | null>(null);
  const [movements, setMovements] = useState<PosCashMovementItem[]>([]);
  const [sales, setSales] = useState<PosSaleItem[]>([]);
  const [drawerTab, setDrawerTab] = useState<'SUMMARY' | 'MOVEMENTS' | 'SALES'>('SUMMARY');

  // Cash movement form
  const [movementFlow, setMovementFlow] = useState<'OUT' | 'IN'>('OUT');
  const [movementCategory, setMovementCategory] = useState<string>('SUPPLIER');
  const [movementBeneficiary, setMovementBeneficiary] = useState<string>('');
  const [movementAmount, setMovementAmount] = useState<string>('');
  const [movementReason, setMovementReason] = useState<string>('');
  const [movementPaymentMethod, setMovementPaymentMethod] = useState<string>('CASH');
  const [movementBusy, setMovementBusy] = useState<boolean>(false);

  // Review modal
  const [reviewFor, setReviewFor] = useState<PosCashierSession | null>(null);
  const [reviewNote, setReviewNote] = useState<string>('');
  const [reviewing, setReviewing] = useState<boolean>(false);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/pos/sessions', { cache: 'no-store' });
      const data = res.ok ? await res.json() : [];
      setSessions(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Impossible de charger les sessions.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const terminalOptions = useMemo(() => {
    const map = new Map<string, string>();
    sessions.forEach((s) => {
      map.set(s.terminalId, s.terminalName || s.terminalId);
    });
    return Array.from(map.entries());
  }, [sessions]);

  const cashierOptions = useMemo(() => {
    const map = new Map<string, string>();
    sessions.forEach((s) => {
      map.set(s.cashierId, s.cashierName || s.cashierId);
    });
    return Array.from(map.entries());
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
      if (terminalFilter !== 'ALL' && s.terminalId !== terminalFilter) return false;
      if (cashierFilter !== 'ALL' && s.cashierId !== cashierFilter) return false;
      if (fromDate) {
        const opened = new Date(s.openedAt);
        const from = new Date(fromDate);
        from.setHours(0, 0, 0, 0);
        if (opened < from) return false;
      }
      if (toDate) {
        const opened = new Date(s.openedAt);
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        if (opened > to) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const tName = (s.terminalName || s.terminalId).toLowerCase();
        const cName = (s.cashierName || s.cashierId).toLowerCase();
        const sId = s.id.toLowerCase();
        if (!tName.includes(q) && !cName.includes(q) && !sId.includes(q)) return false;
      }
      return true;
    });
  }, [sessions, statusFilter, terminalFilter, cashierFilter, fromDate, toDate, searchQuery]);

  async function openSessionDrawer(session: PosCashierSession) {
    setSelectedSession(session);
    setReport(null);
    setMovements([]);
    setSales([]);
    setDrawerTab('SUMMARY');

    // Fetch report
    const type = session.status === 'CLOSED' ? 'Z' : 'X';
    fetch(`/api/admin/pos/sessions/${session.id}/report?type=${type}`, { cache: 'no-store' })
      .then(async (r) => (r.ok ? r.json() : null))
      .then((rep) => rep && setReport(rep))
      .catch(() => {});

    // Fetch movements
    fetch(`/api/admin/pos/sessions/${session.id}/cash-movements`, { cache: 'no-store' })
      .then(async (r) => (r.ok ? r.json() : []))
      .then((mList) => setMovements(Array.isArray(mList) ? mList : []))
      .catch(() => {});

    // Fetch sales
    fetch(`/api/admin/pos/sessions/${session.id}/sales`, { cache: 'no-store' })
      .then(async (r) => (r.ok ? r.json() : []))
      .then((sList) => setSales(Array.isArray(sList) ? sList : []))
      .catch(() => {});
  }

  async function handleAddMovement() {
    if (!selectedSession) return;
    const amountVal = Number(movementAmount);
    if (!amountVal || amountVal <= 0 || !movementReason.trim()) {
      toast.error('Montant et motif obligatoires');
      return;
    }

    setMovementBusy(true);
    try {
      const type = movementFlow === 'OUT' ? 'CASH_OUT' : 'CASH_IN';
      const res = await fetch(`/api/admin/pos/sessions/${selectedSession.id}/cash-movements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          category: movementCategory,
          beneficiary: movementBeneficiary.trim() || undefined,
          amountMinor: Math.round(amountVal * 1000),
          reason: movementReason.trim(),
          paymentMethod: movementPaymentMethod,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur lors du mouvement');

      toast.success('Mouvement de caisse enregistré');
      setMovementAmount('');
      setMovementReason('');
      setMovementBeneficiary('');

      // Refresh drawer & list
      await openSessionDrawer(selectedSession);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setMovementBusy(false);
    }
  }

  function openReview(session: PosCashierSession) {
    setReviewFor(session);
    setReviewNote(session.reviewNote ?? '');
  }

  async function submitReview() {
    if (!reviewFor) return;
    setReviewing(true);
    try {
      const res = await fetch(`/api/admin/pos/sessions/${reviewFor.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: reviewNote.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? 'Erreur lors de la validation');
        return;
      }
      toast.success('Session vérifiée avec succès');
      setReviewFor(null);
      refresh();
    } finally {
      setReviewing(false);
    }
  }

  return (
    <div className="p-4 sm:p-8 space-y-6">
      {/* Top Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900">Sessions de caisse</h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Audit complet des sessions de caisse, mouvements de fonds et export Ticket Z.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => exportSessionsCsv(filteredSessions)}
            disabled={!filteredSessions.length}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs transition disabled:opacity-40"
          >
            <Download size={14} /> Exporter CSV
          </button>
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 shadow-xs transition"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualiser
          </button>
        </div>
      </header>

      {/* Filters Bar */}
      <div className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
          <Filter size={14} /> Filtres de recherche
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {/* Status */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Statut</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
            >
              <option value="ALL">Tous les statuts</option>
              <option value="OPEN">Ouvertes (en cours)</option>
              <option value="CLOSED">Fermées (clôturées)</option>
            </select>
          </div>

          {/* Terminal */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Terminal</label>
            <select
              value={terminalFilter}
              onChange={(e) => setTerminalFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
            >
              <option value="ALL">Tous les terminaux</option>
              {terminalOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>

          {/* Cashier */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Caissier</label>
            <select
              value={cashierFilter}
              onChange={(e) => setCashierFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
            >
              <option value="ALL">Tous les caissiers</option>
              {cashierOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>

          {/* Date from */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Du</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
            />
          </div>

          {/* Date to */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Au</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
            />
          </div>

          {/* Free search */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Recherche</label>
            <div className="relative">
              <input
                type="text"
                placeholder="ID, caissier, terminal..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
              />
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Sessions Table */}
      {filteredSessions.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center">
          <Wallet size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-bold text-slate-700">Aucune session trouvée</p>
          <p className="text-xs text-slate-400 mt-1">Modifiez vos filtres ou effectuez une synchronisation.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-xs">
          <table className="w-full whitespace-nowrap text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-black uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3.5">Statut</th>
                <th className="px-4 py-3.5">Session / Terminal</th>
                <th className="px-4 py-3.5">Caissier</th>
                <th className="px-4 py-3.5">Dates (Ouverture → Fermeture)</th>
                <th className="px-4 py-3.5">Fond initial</th>
                <th className="px-4 py-3.5">CA Net (Tickets)</th>
                <th className="px-4 py-3.5">Solde attendu</th>
                <th className="px-4 py-3.5">Compté & Écart</th>
                <th className="px-4 py-3.5">Vérification</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSessions.map((s) => {
                const diffMinor = s.closingCountedCashMinor !== null ? s.closingCountedCashMinor - s.expectedCashMinor : null;
                const isBalanced = diffMinor === 0;
                const isShortage = diffMinor !== null && diffMinor < 0;

                return (
                  <tr key={s.id} className="hover:bg-slate-50/80 transition">
                    {/* Status */}
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black ${
                          s.status === 'OPEN'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${s.status === 'OPEN' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                        {s.status === 'OPEN' ? 'En cours' : 'Fermée'}
                      </span>
                    </td>

                    {/* Session / Terminal */}
                    <td className="px-4 py-3.5">
                      <div className="font-black text-slate-900">
                        #{s.id.slice(-6).toUpperCase()}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1 mt-0.5">
                        <Monitor size={11} /> {s.terminalName || s.terminalId}
                      </div>
                    </td>

                    {/* Cashier */}
                    <td className="px-4 py-3.5 font-bold text-slate-800">
                      <div className="flex items-center gap-1.5">
                        <User size={12} className="text-slate-400" />
                        <span>{s.cashierName || s.cashierId}</span>
                      </div>
                    </td>

                    {/* Timestamps */}
                    <td className="px-4 py-3.5 text-slate-600">
                      <div>{formatDateTime(s.openedAt)}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {s.closedAt ? `Fermée: ${formatDateTime(s.closedAt)}` : 'Session active'}
                      </div>
                    </td>

                    {/* Float */}
                    <td className="px-4 py-3.5 font-semibold text-slate-700 tabular-nums">
                      {formatMinor(s.openingCashMinor)}
                    </td>

                    {/* Sales */}
                    <td className="px-4 py-3.5">
                      <strong className="text-slate-900 tabular-nums">{formatMinor(s.grossSalesMinor - s.discountsMinor)}</strong>
                      <span className="text-[11px] text-slate-400 block mt-0.5">{s.transactionCount} ticket(s)</span>
                    </td>

                    {/* Expected cash */}
                    <td className="px-4 py-3.5 font-bold text-blue-900 tabular-nums">
                      {formatMinor(s.expectedCashMinor)}
                    </td>

                    {/* Counted & Diff */}
                    <td className="px-4 py-3.5">
                      {s.closingCountedCashMinor !== null ? (
                        <div>
                          <span className="font-bold tabular-nums text-slate-800">
                            {formatMinor(s.closingCountedCashMinor)}
                          </span>
                          <span
                            className={`block text-[11px] font-black tabular-nums mt-0.5 ${
                              isBalanced
                                ? 'text-emerald-700'
                                : isShortage
                                ? 'text-rose-700'
                                : 'text-amber-700'
                            }`}
                          >
                            Écart: {diffMinor! > 0 ? '+' : ''}{formatMinor(diffMinor!)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">En attente clôture</span>
                      )}
                    </td>

                    {/* Review */}
                    <td className="px-4 py-3.5">
                      {s.reviewedAt ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800"
                          title={s.reviewNote ?? undefined}
                        >
                          <CheckCircle2 size={12} className="text-emerald-600" />
                          <span>{s.reviewedBy}</span>
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold text-slate-400">Non vérifiée</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => openSessionDrawer(s)}
                          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 transition"
                        >
                          <Eye size={12} /> Voir
                        </button>
                        {s.status === 'CLOSED' && (
                          <a
                            href={`/api/admin/pos/sessions/${s.id}/pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 rounded-lg bg-blue-50 border border-blue-200 px-2.5 py-1.5 text-[11px] font-bold text-blue-700 hover:bg-blue-100 transition"
                            title="Télécharger Ticket Z PDF"
                          >
                            <Download size={12} /> Ticket Z PDF
                          </a>
                        )}
                        {s.status === 'CLOSED' && !s.reviewedAt && (
                          <button
                            onClick={() => openReview(s)}
                            className="flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 transition"
                          >
                            <ShieldCheck size={12} /> Valider
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Session Details Drawer / Modal */}
      {selectedSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
          onClick={() => setSelectedSession(null)}
        >
          <div
            className="flex flex-col h-[90vh] w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl border border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black text-slate-900">
                    Session #{selectedSession.id.slice(-6).toUpperCase()}
                  </h2>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                      selectedSession.status === 'OPEN'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {selectedSession.status === 'OPEN' ? 'EN COURS' : 'CLÔTURÉE'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Terminal : {selectedSession.terminalName || selectedSession.terminalId} · Caissier : {selectedSession.cashierName || selectedSession.cashierId}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {selectedSession.status === 'CLOSED' && (
                  <a
                    href={`/api/admin/pos/sessions/${selectedSession.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-700 transition"
                  >
                    <Download size={13} /> Ticket Z PDF
                  </a>
                )}
                <button
                  onClick={() => setSelectedSession(null)}
                  className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-200 px-6 bg-white gap-4 text-xs font-bold">
              <button
                type="button"
                onClick={() => setDrawerTab('SUMMARY')}
                className={`py-3 border-b-2 transition ${
                  drawerTab === 'SUMMARY'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Rapport financier & Solde
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab('MOVEMENTS')}
                className={`py-3 border-b-2 transition ${
                  drawerTab === 'MOVEMENTS'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Mouvements de caisse ({movements.length})
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab('SALES')}
                className={`py-3 border-b-2 transition ${
                  drawerTab === 'SALES'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Ventes & Tickets ({sales.length})
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {drawerTab === 'SUMMARY' && (
                <>
                  {/* KPI Cards Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Fond initial</span>
                      <p className="mt-1 text-base font-black text-slate-900 tabular-nums">
                        {formatMinor(selectedSession.openingCashMinor)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <span className="text-[10px] font-bold uppercase text-slate-400">CA Net</span>
                      <p className="mt-1 text-base font-black text-blue-700 tabular-nums">
                        {formatMinor(selectedSession.grossSalesMinor - selectedSession.discountsMinor)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Espèces attendues</span>
                      <p className="mt-1 text-base font-black text-slate-900 tabular-nums">
                        {formatMinor(selectedSession.expectedCashMinor)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Comptage réel</span>
                      <p className="mt-1 text-base font-black text-emerald-700 tabular-nums">
                        {selectedSession.closingCountedCashMinor !== null
                          ? formatMinor(selectedSession.closingCountedCashMinor)
                          : 'En attente'}
                      </p>
                    </div>
                  </div>

                  {/* Financial Breakdown */}
                  {report && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 text-xs">
                      <h3 className="font-black uppercase tracking-wider text-slate-500 mb-2">
                        Ventilation complète
                      </h3>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Ventes brutes</span>
                        <strong className="tabular-nums">{formatMinor(report.grossSalesMinor)}</strong>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100 text-rose-700">
                        <span>Remises accordées</span>
                        <span className="tabular-nums font-bold">-{formatMinor(report.discountsMinor)}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100 text-rose-700">
                        <span>Retours / Remboursements</span>
                        <span className="tabular-nums font-bold">-{formatMinor(report.refundsMinor)}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100 font-bold">
                        <span>Ventes nettes totales</span>
                        <span className="tabular-nums font-black text-blue-700">{formatMinor(report.netSalesMinor)}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Espèces encaissées</span>
                        <span className="tabular-nums font-bold text-emerald-700">+{formatMinor(report.cashSalesMinor)}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Carte bancaire</span>
                        <span className="tabular-nums font-semibold">{formatMinor(report.cardSalesMinor)}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Entrées manuelles (apport caisse)</span>
                        <span className="tabular-nums font-bold text-emerald-700">+{formatMinor(report.cashMovementsAddMinor)}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Sorties manuelles (dépenses)</span>
                        <span className="tabular-nums font-bold text-rose-700">-{formatMinor(report.cashMovementsRemoveMinor)}</span>
                      </div>
                    </div>
                  )}

                  {/* Discrepancy Alert */}
                  {selectedSession.closingCountedCashMinor !== null && (
                    <div
                      className={`rounded-2xl p-4 border text-xs ${
                        selectedSession.closingCountedCashMinor === selectedSession.expectedCashMinor
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                          : selectedSession.closingCountedCashMinor < selectedSession.expectedCashMinor
                          ? 'border-rose-200 bg-rose-50 text-rose-900'
                          : 'border-amber-200 bg-amber-50 text-amber-900'
                      }`}
                    >
                      <div className="flex items-center justify-between font-black">
                        <span>
                          {selectedSession.closingCountedCashMinor === selectedSession.expectedCashMinor
                            ? 'CAISSE PARFAITEMENT ÉQUILIBRÉE'
                            : selectedSession.closingCountedCashMinor < selectedSession.expectedCashMinor
                            ? 'MANQUANT DE CAISSE DÉTECTÉ'
                            : 'SURPLUS DE CAISSE CONSTATÉ'}
                        </span>
                        <span className="text-sm tabular-nums">
                          Écart : {formatMinor(selectedSession.closingCountedCashMinor - selectedSession.expectedCashMinor)}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}

              {drawerTab === 'MOVEMENTS' && (
                <div className="space-y-6">
                  {/* Administrative Cash Movement Form if session is OPEN */}
                  {selectedSession.status === 'OPEN' && (
                    <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5 space-y-4">
                      <div className="flex items-center gap-2 font-black text-xs uppercase tracking-wider text-blue-900">
                        <ArrowDownRight size={16} /> Enregistrer un mouvement de caisse
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Type de flux</label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setMovementFlow('OUT');
                                setMovementCategory('SUPPLIER');
                              }}
                              className={`py-2 text-center rounded-xl font-bold transition border ${
                                movementFlow === 'OUT'
                                  ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              Sortie d&apos;argent
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMovementFlow('IN');
                                setMovementCategory('FLOAT_ADD');
                              }}
                              className={`py-2 text-center rounded-xl font-bold transition border ${
                                movementFlow === 'IN'
                                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              Entrée d&apos;argent
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Catégorie</label>
                          <select
                            value={movementCategory}
                            onChange={(e) => setMovementCategory(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none"
                          >
                            {movementFlow === 'OUT' ? (
                              <>
                                <option value="SUPPLIER">Paiement Fournisseur</option>
                                <option value="SALARY">Salaire / Avance employé</option>
                                <option value="TRANSPORT">Frais de Transport / Coursier</option>
                                <option value="EQUIPMENT">Achat petit matériel / Magasin</option>
                                <option value="MISC">Frais divers</option>
                                <option value="OTHER">Autre sortie</option>
                              </>
                            ) : (
                              <>
                                <option value="FLOAT_ADD">Apport fond de caisse</option>
                                <option value="REFUND_IN">Remboursement perçu</option>
                                <option value="ADJUSTMENT">Ajustement de caisse</option>
                                <option value="OTHER">Autre entrée</option>
                              </>
                            )}
                          </select>
                        </div>

                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Bénéficiaire / Personne</label>
                          <input
                            type="text"
                            placeholder="Ex: Chauffeur, Mohamed..."
                            value={movementBeneficiary}
                            onChange={(e) => setMovementBeneficiary(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none"
                          />
                        </div>

                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Montant (DT)</label>
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            placeholder="0.000"
                            value={movementAmount}
                            onChange={(e) => setMovementAmount(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black tabular-nums outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 mb-1 text-xs">Motif / Justificatif obligatoire</label>
                        <input
                          type="text"
                          placeholder="Justification détaillée du mouvement..."
                          value={movementReason}
                          onChange={(e) => setMovementReason(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none"
                        />
                      </div>

                      <button
                        type="button"
                        disabled={movementBusy || !movementReason.trim() || !(Number(movementAmount) > 0)}
                        onClick={handleAddMovement}
                        className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-40 transition"
                      >
                        {movementBusy ? 'Enregistrement…' : 'Valider le mouvement de caisse'}
                      </button>
                    </div>
                  )}

                  {/* Movements List */}
                  {movements.length === 0 ? (
                    <p className="text-center text-xs text-slate-400 py-8">Aucun mouvement enregistré dans cette session.</p>
                  ) : (
                    <div className="space-y-2">
                      {movements.map((m, idx) => {
                        const isOut = m.type === 'REMOVE' || m.type === 'CASH_OUT';
                        return (
                          <div
                            key={m._id || m.id || idx}
                            className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-3.5 text-xs"
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`grid h-9 w-9 place-items-center rounded-xl ${
                                  isOut ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                                }`}
                              >
                                {isOut ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                              </div>
                              <div>
                                <p className="font-black text-slate-900">
                                  {m.categoryLabel || m.category || (isOut ? 'Sortie d’argent' : 'Entrée d’argent')}
                                  {m.beneficiary && <span className="font-normal text-slate-500"> · {m.beneficiary}</span>}
                                </p>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  {m.reason} · Par {m.performedByName || 'Caissier'} · {formatDateTime(m.createdAt)}
                                </p>
                              </div>
                            </div>
                            <span
                              className={`text-sm font-black tabular-nums ${
                                isOut ? 'text-rose-700' : 'text-emerald-700'
                              }`}
                            >
                              {isOut ? '-' : '+'}{formatMinor(m.amountMinor)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {drawerTab === 'SALES' && (
                <div className="space-y-2">
                  {sales.length === 0 ? (
                    <p className="text-center text-xs text-slate-400 py-8">Aucune vente enregistrée dans cette session.</p>
                  ) : (
                    sales.map((sale) => (
                      <div
                        key={sale._id}
                        className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-3.5 text-xs"
                      >
                        <div>
                          <p className="font-bold text-slate-900">Ticket #{sale.saleNumber}</p>
                          <p className="text-[11px] text-slate-500">{formatDateTime(sale.createdAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-slate-900 tabular-nums">
                            {formatMinor(sale.finalTotalMinor)}
                          </p>
                          <span
                            className={`text-[10px] font-bold uppercase ${
                              sale.status === 'CANCELLED' ? 'text-rose-600' : 'text-emerald-600'
                            }`}
                          >
                            {sale.status === 'CANCELLED' ? 'Annulée' : 'Encaissée'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {reviewFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
          onClick={() => setReviewFor(null)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <ShieldCheck size={18} className="text-emerald-600" />
                Vérifier la session #{reviewFor.id.slice(-6).toUpperCase()}
              </h2>
              <button
                onClick={() => setReviewFor(null)}
                className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              En confirmant la vérification, vous attestez avoir contrôlé les montants de fermeture, les encaissements et les justificatifs de dépenses de cette session.
            </p>

            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Note de validation (optionnelle)
            </label>
            <textarea
              rows={3}
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="Ex: Écart justifié par erreur de rendu de monnaie, tickets vérifiés..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 mb-4"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setReviewFor(null)}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={reviewing}
                onClick={submitReview}
                className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                {reviewing ? 'Validation…' : 'Confirmer la vérification'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}