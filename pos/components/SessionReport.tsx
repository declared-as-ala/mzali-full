'use client';
import { formatMinor } from '@/lib/money';
import type { PosSessionReport } from '@/types/pos';

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${strong ? 'font-black text-ink-900' : 'text-ink-700'}`}>
      <span className="text-sm">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

export default function SessionReport({ report }: { report: PosSessionReport }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-black text-ink-900">
          Rapport {report.type === 'Z' ? 'Z (clôture)' : 'X (en cours)'}
        </h3>
        <span className="text-xs text-ink-500">{new Date(report.generatedAt).toLocaleString('fr-TN')}</span>
      </div>

      <Row label="Ventes brutes" value={formatMinor(report.grossSalesMinor)} />
      <Row label="Remises" value={`- ${formatMinor(report.discountsMinor)}`} />
      <Row label="Remboursements" value={`- ${formatMinor(report.refundsMinor)}`} />
      <Row label="Ventes nettes" value={formatMinor(report.netSalesMinor)} strong />
      <div className="my-2 border-t border-ink-200" />
      <Row label="Espèces" value={formatMinor(report.cashSalesMinor)} />
      <Row label="Carte" value={formatMinor(report.cardSalesMinor)} />
      <Row label="Autre" value={formatMinor(report.otherSalesMinor)} />
      <div className="my-2 border-t border-ink-200" />
      <Row label="Entrées de caisse" value={`+ ${formatMinor(report.cashMovementsAddMinor)}`} />
      <Row label="Sorties de caisse" value={`- ${formatMinor(report.cashMovementsRemoveMinor)}`} />
      <Row label="Tickets" value={String(report.transactionCount)} />
      <div className="my-2 border-t border-ink-200" />
      <Row label="Espèces attendues" value={formatMinor(report.expectedCashMinor)} strong />
      {report.countedCashMinor !== null && (
        <>
          <Row label="Espèces comptées" value={formatMinor(report.countedCashMinor)} strong />
          <Row
            label="Écart"
            value={`${(report.cashDifferenceMinor ?? 0) >= 0 ? '+' : ''}${formatMinor(report.cashDifferenceMinor ?? 0)}`}
            strong
          />
          {report.flagged && (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-center text-sm font-bold text-amber-700">
              Écart au-delà de la tolérance — à signaler au responsable.
            </p>
          )}
        </>
      )}
    </div>
  );
}
