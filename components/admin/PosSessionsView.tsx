'use client';
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, RefreshCw, ShieldCheck, Wallet, X } from 'lucide-react';
import { useToast } from './Toast';

type PosCashierSession = {
  id: string;
  cashierId: string;
  terminalId: string;
  openingCashMinor: number;
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
};

function formatMinor(minor: number): string {
  return `${(minor / 1000).toFixed(3)} DT`;
}

function exportSessionsCsv(sessions: PosCashierSession[]) {
  const rows = [
    'statut,ouverture,fermeture,ventes_brutes_dt,tickets,ecart_caisse_verifie,verifie_par',
    ...sessions.map((s) => [
      s.status,
      s.openedAt,
      s.closedAt ?? '',
      (s.grossSalesMinor / 1000).toFixed(3),
      s.transactionCount,
      s.reviewedAt ? 'oui' : 'non',
      s.reviewedBy ?? '',
    ].join(',')),
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
  const [reportFor, setReportFor] = useState<PosCashierSession | null>(null);
  const [report, setReport] = useState<PosSessionReport | null>(null);
  const [reviewFor, setReviewFor] = useState<PosCashierSession | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewing, setReviewing] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/pos/sessions', { cache: 'no-store' });
      setSessions(res.ok ? await res.json() : []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);

  async function openReport(session: PosCashierSession) {
    setReportFor(session);
    setReport(null);
    const type = session.status === 'CLOSED' ? 'Z' : 'X';
    const res = await fetch(`/api/admin/pos/sessions/${session.id}/report?type=${type}`, { cache: 'no-store' });
    if (res.ok) setReport(await res.json());
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: reviewNote.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error ?? 'Erreur'); return; }
      toast.success('Session vérifiée');
      setReviewFor(null);
      refresh();
    } finally {
      setReviewing(false);
    }
  }

  return (
    <div className="p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black">Sessions de caisse</h1>
          <p className="text-ink-700">Historique des ouvertures/fermetures de caisse et rapports X/Z.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => exportSessionsCsv(sessions)} disabled={!sessions.length} className="btn-ghost inline-flex items-center gap-2 disabled:opacity-40">
            <Download size={14} /> Exporter CSV
          </button>
          <button onClick={refresh} className="btn-ghost inline-flex items-center gap-2">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualiser
          </button>
        </div>
      </header>

      {sessions.length === 0 ? (
        <p className="text-sm text-ink-700">Aucune session pour le moment.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink-100 text-xs font-black uppercase text-ink-700">
              <tr>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Ouverture</th>
                <th className="px-4 py-3">Fermeture</th>
                <th className="px-4 py-3">Ventes brutes</th>
                <th className="px-4 py-3">Tickets</th>
                <th className="px-4 py-3">Vérification</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-t border-ink-200">
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-black ${s.status === 'OPEN' ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-200 text-ink-700'}`}>
                      {s.status === 'OPEN' ? 'Ouverte' : 'Fermée'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-700">{new Date(s.openedAt).toLocaleString('fr-FR')}</td>
                  <td className="px-4 py-3 text-ink-700">{s.closedAt ? new Date(s.closedAt).toLocaleString('fr-FR') : '—'}</td>
                  <td className="px-4 py-3 font-bold">{formatMinor(s.grossSalesMinor)}</td>
                  <td className="px-4 py-3 text-ink-700">{s.transactionCount}</td>
                  <td className="px-4 py-3">
                    {s.reviewedAt ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-black text-emerald-700" title={s.reviewNote ?? undefined}>
                        <CheckCircle2 size={12} /> {s.reviewedBy}
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-ink-500">Non vérifiée</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1.5">
                      <button onClick={() => openReport(s)} className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-xs">
                        <Wallet size={13} /> Rapport
                      </button>
                      {s.status === 'CLOSED' && !s.reviewedAt && (
                        <button onClick={() => openReview(s)} className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-brand-700">
                          <ShieldCheck size={13} /> Vérifier
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reportFor && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" onClick={() => setReportFor(null)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black text-ink-900">
                Rapport {report?.type === 'Z' ? 'Z (clôture)' : 'X (en cours)'}
              </h2>
              <button onClick={() => setReportFor(null)} className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100" aria-label="Fermer">
                <X size={18} />
              </button>
            </div>
            {!report ? (
              <div className="grid h-32 place-items-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-ink-200 border-t-brand-500" />
              </div>
            ) : (
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span>Ventes brutes</span><span className="font-bold">{formatMinor(report.grossSalesMinor)}</span></div>
                <div className="flex justify-between"><span>Remises</span><span>- {formatMinor(report.discountsMinor)}</span></div>
                <div className="flex justify-between"><span>Ventes nettes</span><span className="font-black">{formatMinor(report.netSalesMinor)}</span></div>
                <div className="my-2 border-t border-ink-200" />
                <div className="flex justify-between"><span>Espèces</span><span>{formatMinor(report.cashSalesMinor)}</span></div>
                <div className="flex justify-between"><span>Carte</span><span>{formatMinor(report.cardSalesMinor)}</span></div>
                <div className="flex justify-between"><span>Autre</span><span>{formatMinor(report.otherSalesMinor)}</span></div>
                <div className="my-2 border-t border-ink-200" />
                <div className="flex justify-between font-bold"><span>Espèces attendues</span><span>{formatMinor(report.expectedCashMinor)}</span></div>
                {report.countedCashMinor !== null && (
                  <>
                    <div className="flex justify-between font-bold"><span>Espèces comptées</span><span>{formatMinor(report.countedCashMinor)}</span></div>
                    <div className="flex justify-between font-bold"><span>Écart</span><span>{formatMinor(report.cashDifferenceMinor ?? 0)}</span></div>
                  </>
                )}
                {report.flagged && (
                  <p className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                    <AlertTriangle size={14} /> Écart au-delà de la tolérance.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {reviewFor && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" onClick={() => setReviewFor(null)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black text-ink-900">Vérifier la session</h2>
              <button onClick={() => setReviewFor(null)} className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100" aria-label="Fermer">
                <X size={18} />
              </button>
            </div>
            <p className="mb-3 text-sm text-ink-700">
              Marquer cette session comme vérifiée par un responsable. Cette action est journalisée et n&apos;altère aucun total financier.
            </p>
            <label className="block text-xs font-bold text-ink-700">Note (optionnelle)
              <textarea className="input mt-1 min-h-24" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Observations, écart expliqué, etc." />
            </label>
            <button disabled={reviewing} onClick={submitReview} className="btn-primary mt-4 w-full disabled:opacity-40">
              {reviewing ? 'Enregistrement…' : 'Marquer comme vérifiée'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
