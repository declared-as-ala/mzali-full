'use client';
import { formatMinor } from '@/lib/money';
import type { PosSessionReport } from '@/types/pos';

function Row({
  label,
  value,
  strong,
  accent,
}: {
  label: string;
  value: string;
  strong?: boolean;
  accent?: 'emerald' | 'rose' | 'amber' | 'blue';
}) {
  const accentClass =
    accent === 'emerald'
      ? 'text-emerald-700'
      : accent === 'rose'
      ? 'text-rose-700'
      : accent === 'amber'
      ? 'text-amber-700'
      : accent === 'blue'
      ? 'text-blue-700'
      : strong
      ? 'font-black text-slate-900'
      : 'text-slate-700';

  return (
    <div className={`flex items-center justify-between gap-3 py-1.5 ${strong ? 'font-black' : ''}`}>
      <span className={`text-xs sm:text-sm ${strong ? 'text-slate-900' : 'text-slate-600'}`}>{label}</span>
      <span className={`shrink-0 text-right text-xs sm:text-sm tabular-nums ${accentClass}`}>{value}</span>
    </div>
  );
}

export default function SessionReport({ report }: { report: PosSessionReport }) {
  const isZ = report.type === 'Z';
  const diff = report.cashDifferenceMinor ?? 0;
  const isBalanced = report.countedCashMinor !== null && diff === 0;
  const isShortage = report.countedCashMinor !== null && diff < 0;
  const isSurplus = report.countedCashMinor !== null && diff > 0;

  const details = report.details as Record<string, unknown> | undefined;

  // Breakdown of articles / products sold during this session
  const rawArticles = (Array.isArray(details?.articlesSold) ? details.articlesSold : []) as Array<{
    description: string;
    qty: number;
    totalMinor: number;
  }>;

  const sales = (Array.isArray(details?.sales) ? details.sales : []) as Array<{
    status?: string;
    lines?: Array<{ description?: string; descriptionSnapshot?: string; qty: number; lineTotalMinor: number }>;
  }>;

  let articlesSold = rawArticles;
  if (articlesSold.length === 0 && sales.length > 0) {
    const map = new Map<string, { description: string; qty: number; totalMinor: number }>();
    for (const s of sales) {
      if (s.status !== 'CANCELLED' && s.status !== 'SUSPENDED') {
        for (const l of (s.lines || [])) {
          const name = l.description || l.descriptionSnapshot || 'Article';
          const cur = map.get(name);
          if (cur) {
            cur.qty += l.qty;
            cur.totalMinor += l.lineTotalMinor;
          } else {
            map.set(name, { description: name, qty: l.qty, totalMinor: l.lineTotalMinor });
          }
        }
      }
    }
    articlesSold = Array.from(map.values()).sort((a, b) => b.qty - a.qty);
  }

  const totalArticlesQty = articlesSold.reduce((acc, i) => acc + i.qty, 0);

  return (
    <div id="session-ticket-z-thermal" className="receipt-print mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-lg print:border-none print:shadow-none print:p-0 print:max-w-none print:m-0 print:w-full print:text-black">
      {/* Receipt Header */}
      <div className="border-b-2 border-dashed border-slate-300 pb-5 text-center">
        <h2 className="text-xl font-black uppercase tracking-wider text-slate-900 print:text-black">
          Boutique Ahmed Mzali
        </h2>
        <p className="text-xs font-semibold text-slate-500 mt-0.5 print:text-black">Mode Masculine & Accessoires</p>
        <p className="text-[11px] text-slate-400 print:text-black">Tél : +216 22 479 443 · Tunisie</p>

        <div className="mt-4 inline-block rounded-xl border border-slate-900 bg-slate-900 px-4 py-1 text-xs font-black uppercase tracking-widest text-white print:border-black print:bg-transparent print:text-black">
          {isZ ? 'TICKET Z · CLÔTURE DE CAISSE' : 'TICKET X · ÉTAT PROVISOIRE'}
        </div>

        <div className="mt-3 text-[11px] text-slate-500 print:text-black space-y-0.5">
          <p>Édité le : {new Date(report.generatedAt).toLocaleString('fr-TN', { timeZone: 'Africa/Tunis' })}</p>
          <p>Transactions : <strong className="text-slate-800 print:text-black">{report.transactionCount}</strong></p>
        </div>
      </div>

      {/* Sales Summary */}
      <div className="py-4 border-b border-dashed border-slate-200">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 print:text-black mb-2">
          1. Résumé des ventes
        </h3>
        <Row label="Ventes brutes" value={formatMinor(report.grossSalesMinor)} />
        <Row label="Remises & offres" value={`- ${formatMinor(report.discountsMinor)}`} accent="rose" />
        <Row label="Retours / remboursements" value={`- ${formatMinor(report.refundsMinor)}`} accent="rose" />
        <Row label="Ventes nettes (CA)" value={formatMinor(report.netSalesMinor)} strong accent="blue" />
      </div>

      {/* Payment Methods */}
      <div className="py-4 border-b border-dashed border-slate-200">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 print:text-black mb-2">
          2. Ventilation des encaissements
        </h3>
        <Row label="Espèces (ventes)" value={formatMinor(report.cashSalesMinor)} accent="emerald" />
        <Row label="Carte bancaire" value={formatMinor(report.cardSalesMinor)} />
        <Row label="Autre moyen" value={formatMinor(report.otherSalesMinor)} />
      </div>

      {/* Movements breakdown */}
      <div className="py-4 border-b border-dashed border-slate-200">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 print:text-black mb-2">
          3. Mouvements de caisse
        </h3>
        <Row label="Entrées de caisse (apports)" value={`+ ${formatMinor(report.cashMovementsAddMinor)}`} accent="emerald" />
        <Row label="Sorties de caisse (dépenses)" value={`- ${formatMinor(report.cashMovementsRemoveMinor)}`} accent="rose" />
      </div>

      {/* Drawer Reconciliation */}
      <div className="py-4 border-b-2 border-dashed border-slate-300">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 print:text-black mb-2">
          4. Réconciliation du tiroir-caisse
        </h3>
        <Row label="Fond de caisse initial" value={formatMinor(Number(details?.openingCashMinor ?? 0))} />
        <Row label="(+) Ventes espèces" value={`+ ${formatMinor(report.cashSalesMinor)}`} />
        <Row label="(+) Entrées de caisse" value={`+ ${formatMinor(report.cashMovementsAddMinor)}`} />
        <Row label="(-) Retours espèces" value={`- ${formatMinor(report.cashRefundsMinor ?? 0)}`} />
        <Row label="(-) Sorties de caisse" value={`- ${formatMinor(report.cashMovementsRemoveMinor)}`} />

        <div className="my-2 border-t border-slate-200" />
        <Row label="Solde théorique attendu" value={formatMinor(report.expectedCashMinor)} strong />

        {report.countedCashMinor !== null && (
          <>
            <Row label="Espèces réellement comptées" value={formatMinor(report.countedCashMinor)} strong />
            <div
              className={`mt-2 rounded-xl p-3 border ${
                isBalanced
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900 print:border-black print:bg-transparent print:text-black'
                  : isShortage
                  ? 'border-rose-200 bg-rose-50 text-rose-900 print:border-black print:bg-transparent print:text-black'
                  : 'border-amber-200 bg-amber-50 text-amber-900 print:border-black print:bg-transparent print:text-black'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-black">
                <span>
                  {isBalanced
                    ? 'SOLDE EXACT (ÉQUILIBRÉ)'
                    : isShortage
                    ? 'MANQUANT DE CAISSE'
                    : 'SURPLUS DE CAISSE'}
                </span>
                <span className="text-sm tabular-nums">
                  {diff > 0 ? '+' : ''}
                  {formatMinor(diff)}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 5. Articles vendus (djin * 5, maryoul * 2, etc.) */}
      <div className="py-4 border-b-2 border-dashed border-slate-300">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 print:text-black mb-2">
          5. Articles vendus {totalArticlesQty > 0 ? `(${totalArticlesQty})` : ''}
        </h3>
        {articlesSold.length === 0 ? (
          <p className="text-xs text-slate-400 print:text-black italic">Aucun article vendu pendant cette session</p>
        ) : (
          <div className="space-y-1.5 pt-0.5">
            {articlesSold.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2 py-1 text-xs sm:text-sm">
                <span className="font-bold text-slate-800 print:text-black truncate">
                  {item.description} <span className="font-black text-blue-600 print:text-black">× {item.qty}</span>
                </span>
                <span className="shrink-0 tabular-nums font-bold text-slate-900 print:text-black">
                  {formatMinor(item.totalMinor)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Signature lines */}
      <div className="pt-6 pb-2 text-[11px] text-slate-500 print:text-black">
        <div className="grid grid-cols-2 gap-8 text-center">
          <div className="border-t border-slate-300 print:border-black pt-3">
            <p className="font-bold text-slate-800 print:text-black">Signature Caissier</p>
          </div>
          <div className="border-t border-slate-300 print:border-black pt-3">
            <p className="font-bold text-slate-800 print:text-black">Signature Responsable</p>
          </div>
        </div>
        <p className="mt-6 text-center text-[10px] text-slate-400 print:text-black">
          Document certifié · Système POS Boutique Ahmed Mzali
        </p>
      </div>
    </div>
  );
}
