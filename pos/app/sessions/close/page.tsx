'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Coins,
  Download,
  FileText,
  HelpCircle,
  LogOut,
  Printer,
  Receipt,
  RotateCcw,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';
import { posFetch } from '@/lib/device';
import { formatMinor } from '@/lib/money';
import SessionReport from '@/components/SessionReport';
import type { PosCashierSession, PosSessionReport } from '@/types/pos';

export default function CloseSessionPage() {
  const router = useRouter();
  const [session, setSession] = useState<PosCashierSession | null | undefined>(undefined);
  const [liveReport, setLiveReport] = useState<PosSessionReport | null>(null);
  const [zReport, setZReport] = useState<PosSessionReport | null>(null);
  const [closedSessionId, setClosedSessionId] = useState<string | null>(null);
  const [countedCash, setCountedCash] = useState<string>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState<number>(1);

  useEffect(() => {
    posFetch('/api/sessions', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Caisse indisponible');
        return data;
      })
      .then((body: { session: PosCashierSession | null }) => {
        const data = body.session;
        setSession(data);
        if (!data) return;
        return posFetch(`/api/sessions/${data.id}/report?type=X`, { cache: 'no-store' })
          .then(async (res) => {
            const rData = await res.json();
            if (!res.ok) throw new Error(rData.error ?? 'Caisse indisponible');
            return rData;
          })
          .then((report) => setLiveReport(report));
      })
      .catch((e) => {
        setSession(null);
        setError(e instanceof Error ? e.message : 'Caisse indisponible');
      });
  }, [router]);

  const countedMinor = useMemo(() => {
    if (countedCash.trim() === '' || isNaN(Number(countedCash))) return null;
    return Math.max(0, Math.round(Number(countedCash) * 1000));
  }, [countedCash]);

  const expectedMinor = liveReport?.expectedCashMinor ?? session?.expectedCashMinor ?? 0;
  const differenceMinor = countedMinor !== null ? countedMinor - expectedMinor : null;

  async function handleClose() {
    if (!session || countedMinor === null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await posFetch(`/api/sessions/${session.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          closingCountedCashMinor: countedMinor,
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Impossible de fermer la session');

      setClosedSessionId(session.id);
      window.dispatchEvent(new Event('pos-cash-changed'));

      const reportRes = await posFetch(`/api/sessions/${session.id}/report?type=Z`, { cache: 'no-store' });
      if (reportRes.ok) {
        setZReport(await reportRes.json());
      } else {
        // Fallback report
        setZReport({
          ...liveReport!,
          type: 'Z',
          countedCashMinor: countedMinor,
          cashDifferenceMinor: differenceMinor,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    await fetch('/api/auth', { method: 'DELETE' });
    router.replace('/login');
  }

  function handlePrintThermal() {
    window.print();
  }

  if (session === undefined) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-emerald-600" />
          <p className="text-xs font-bold text-slate-500">Chargement de la session…</p>
        </div>
      </div>
    );
  }

  if (session === null && !zReport) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100 p-6 text-center">
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-xl border border-slate-200">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-600">
            <AlertCircle size={28} />
          </div>
          <h2 className="text-lg font-black text-slate-900 mb-2">Aucune session active</h2>
          <p className="mb-6 text-xs text-slate-500">
            {error || 'Il n’y a pas de session de caisse ouverte sur ce terminal.'}
          </p>
          <button
            onClick={() => router.replace('/sessions/open')}
            className="w-full rounded-2xl bg-emerald-600 py-3.5 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-700 transition"
          >
            Ouvrir une caisse
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-4 sm:px-6">
      <div className={`mx-auto w-full ${zReport ? 'max-w-2xl' : 'max-w-5xl'}`}>
        {/* Header Bar */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.replace('/till')}
              disabled={Boolean(zReport)}
              className="grid h-10 w-10 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition disabled:opacity-40"
              title="Retour à la caisse"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900">
                {zReport ? 'Ticket Z — Clôture définitive' : 'Clôture de session de caisse'}
              </h1>
              <p className="text-xs text-slate-500">
                {session?.terminalName || session?.terminalId} · Caissier : {session?.cashierName || session?.cashierId}
              </p>
            </div>
          </div>

          {zReport && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrintThermal}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs transition"
              >
                <Printer size={15} /> Imprimer Ticket Z
              </button>
              {closedSessionId && (
                <a
                  href={`/api/sessions/${closedSessionId}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-700 shadow-xs transition"
                >
                  <Download size={15} /> Télécharger A4 PDF
                </a>
              )}
            </div>
          )}
        </header>

        {!zReport ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left side: Live summary / breakdown */}
            <div className="lg:col-span-7 space-y-4">
              {/* Sales & Payment Overview Card */}
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                  <h2 className="text-sm font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <Receipt size={16} className="text-blue-600" />
                    1. Résumé des ventes de la session
                  </h2>
                  <span className="text-xs font-bold text-slate-500">
                    {liveReport?.transactionCount ?? session?.transactionCount ?? 0} tickets
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Ventes brutes</span>
                    <p className="mt-1 text-sm font-black text-slate-900">
                      {formatMinor(liveReport?.grossSalesMinor ?? session?.grossSalesMinor ?? 0)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Remises</span>
                    <p className="mt-1 text-sm font-black text-rose-600">
                      -{formatMinor(liveReport?.discountsMinor ?? session?.discountsMinor ?? 0)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Retours</span>
                    <p className="mt-1 text-sm font-black text-amber-600">
                      -{formatMinor(liveReport?.refundsMinor ?? 0)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-blue-50/70 p-3 border border-blue-100">
                    <span className="text-[10px] font-bold uppercase text-blue-700">CA Net</span>
                    <p className="mt-1 text-sm font-black text-blue-900">
                      {formatMinor(liveReport?.netSalesMinor ?? session?.grossSalesMinor ?? 0)}
                    </p>
                  </div>
                </div>

                {/* Payments */}
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                  2. Détail par moyen de paiement
                </h3>
                <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-slate-50/50 p-3 text-xs mb-4">
                  <div className="flex justify-between py-1.5 font-bold text-slate-700">
                    <span>Espèces encaissées</span>
                    <span className="tabular-nums font-black text-emerald-700">
                      +{formatMinor(liveReport?.cashSalesMinor ?? session?.cashSalesMinor ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 text-slate-600">
                    <span>Carte bancaire (TPE)</span>
                    <span className="tabular-nums font-semibold">
                      {formatMinor(liveReport?.cardSalesMinor ?? session?.cardSalesMinor ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 text-slate-600">
                    <span>Autre (Virement / Chèque)</span>
                    <span className="tabular-nums font-semibold">
                      {formatMinor(liveReport?.otherSalesMinor ?? session?.otherSalesMinor ?? 0)}
                    </span>
                  </div>
                </div>

                {/* Cash Drawer Movements */}
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                  3. Mouvements manuels de caisse
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3">
                    <ArrowDownRight size={18} className="text-emerald-600 flex-none" />
                    <div>
                      <span className="text-[10px] font-bold uppercase text-emerald-800">Entrées de caisse</span>
                      <p className="text-xs font-black text-emerald-900">
                        +{formatMinor(liveReport?.cashMovementsAddMinor ?? session?.cashMovementsAddMinor ?? 0)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-2xl border border-rose-100 bg-rose-50/50 p-3">
                    <ArrowUpRight size={18} className="text-rose-600 flex-none" />
                    <div>
                      <span className="text-[10px] font-bold uppercase text-rose-800">Sorties (dépenses)</span>
                      <p className="text-xs font-black text-rose-900">
                        -{formatMinor(liveReport?.cashMovementsRemoveMinor ?? session?.cashMovementsRemoveMinor ?? 0)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Formula explanation box */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500 shadow-xs">
                <span className="font-bold text-slate-700">Calcul du solde théorique :</span>
                <p className="mt-1 font-mono text-[11px] leading-relaxed text-slate-600">
                  Fond ({formatMinor(session?.openingCashMinor ?? 0)}) + Ventes espèces ({formatMinor(liveReport?.cashSalesMinor ?? session?.cashSalesMinor ?? 0)}) + Entrées ({formatMinor(liveReport?.cashMovementsAddMinor ?? session?.cashMovementsAddMinor ?? 0)}) - Sorties ({formatMinor(liveReport?.cashMovementsRemoveMinor ?? session?.cashMovementsRemoveMinor ?? 0)}) - Retours ({formatMinor(liveReport?.cashRefundsMinor ?? 0)})
                </p>
              </div>
            </div>

            {/* Right side: Counting & Closure Wizard */}
            <div className="lg:col-span-5">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sticky top-6">
                <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                      <Coins size={16} />
                    </div>
                    <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">
                      4. Comptage physique
                    </h2>
                  </div>
                  <span className="text-xs font-bold text-slate-400">Étape finale</span>
                </div>

                {/* Expected Cash KPI */}
                <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50/80 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                        Espèces théoriques attendues
                      </span>
                      <p className="text-2xl font-black text-blue-900 tabular-nums">
                        {formatMinor(expectedMinor)}
                      </p>
                    </div>
                    <Wallet size={28} className="text-blue-500/40" />
                  </div>
                </div>

                {/* Counted Cash Input */}
                <div className="mb-5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    5. Montant réellement compté en caisse (DT)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      autoFocus
                      aria-label="Montant compté en caisse (DT)"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 text-center text-3xl font-black text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                      value={countedCash}
                      min={0}
                      step={0.001}
                      placeholder="0.000"
                      onChange={(e) => setCountedCash(e.target.value)}
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                      DT
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setCountedCash((expectedMinor / 1000).toFixed(3))}
                      className="text-[11px] font-bold text-blue-600 hover:underline"
                    >
                      Copier montant attendu ({formatMinor(expectedMinor)})
                    </button>
                    {countedMinor !== null && (
                      <span className="text-xs font-black text-slate-800 tabular-nums">
                        {formatMinor(countedMinor)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Discrepancy indicator */}
                {differenceMinor !== null && (
                  <div
                    className={`mb-5 rounded-2xl p-4 border transition-all ${
                      differenceMinor === 0
                        ? 'border-emerald-200 bg-emerald-50/80 text-emerald-900'
                        : differenceMinor < 0
                        ? 'border-rose-200 bg-rose-50/80 text-rose-900'
                        : 'border-amber-200 bg-amber-50/80 text-amber-900'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {differenceMinor === 0 ? (
                          <CheckCircle2 size={20} className="text-emerald-600" />
                        ) : differenceMinor < 0 ? (
                          <AlertCircle size={20} className="text-rose-600" />
                        ) : (
                          <AlertTriangle size={20} className="text-amber-600" />
                        )}
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider">
                            {differenceMinor === 0
                              ? 'Caisse parfaitement équilibrée'
                              : differenceMinor < 0
                              ? 'Manquant de caisse'
                              : 'Surplus de caisse'}
                          </p>
                          <p className="text-xs opacity-80">
                            {differenceMinor === 0
                              ? 'Aucun écart constaté avec le solde théorique'
                              : differenceMinor < 0
                              ? 'Il manque de l’argent dans le tiroir'
                              : 'Il y a plus d’argent que prévu dans le tiroir'}
                          </p>
                        </div>
                      </div>
                      <span className="text-lg font-black tabular-nums">
                        {differenceMinor > 0 ? '+' : ''}
                        {formatMinor(differenceMinor)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Closing note */}
                <div className="mb-5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    6. Note de clôture {differenceMinor !== null && differenceMinor !== 0 ? '(recommandée)' : '(facultative)'}
                  </label>
                  <textarea
                    rows={2}
                    maxLength={500}
                    placeholder="Commentaire de clôture, justification d’écart, etc."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>

                {error && (
                  <p className="mb-4 rounded-xl bg-rose-50 border border-rose-200 p-3 text-center text-xs font-bold text-rose-700">
                    {error}
                  </p>
                )}

                {/* Validation button */}
                <button
                  type="button"
                  disabled={busy || countedMinor === null}
                  onClick={handleClose}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 text-sm font-black uppercase tracking-wider text-white shadow-xl shadow-slate-900/20 transition hover:bg-slate-800 active:scale-[0.99] disabled:opacity-40 disabled:pointer-events-none"
                >
                  {busy ? (
                    <>
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      <span>Clôture et génération Ticket Z…</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={18} />
                      <span>7. Confirmer et clôturer la caisse</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Z Report View */
          <div className="space-y-4">
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-center">
              <CheckCircle2 size={28} className="mx-auto text-emerald-600 mb-1" />
              <h2 className="text-base font-black text-emerald-950">
                Session de caisse clôturée avec succès
              </h2>
              <p className="text-xs text-emerald-800">
                Le Ticket Z a été généré et archivé de manière immuable.
              </p>
            </div>

            <SessionReport report={zReport} />

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={handlePrintThermal}
                className="flex-1 flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white py-4 text-sm font-black text-slate-800 hover:bg-slate-50 transition shadow-sm"
              >
                <Printer size={18} /> Imprimer Ticket Z (80mm)
              </button>
              {closedSessionId && (
                <a
                  href={`/api/sessions/${closedSessionId}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 text-sm font-black text-white hover:bg-blue-700 transition shadow-sm"
                >
                  <Download size={18} /> Télécharger Rapport A4 PDF
                </a>
              )}
              <button
                type="button"
                onClick={finish}
                className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-slate-900 py-4 text-sm font-black text-white hover:bg-slate-800 transition shadow-sm"
              >
                <LogOut size={18} /> Terminer et se déconnecter
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}