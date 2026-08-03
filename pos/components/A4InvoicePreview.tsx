'use client';
import { useEffect } from 'react';
import { Printer, X } from 'lucide-react';
import { formatMinor } from '@/lib/money';
import type { PosSale } from '@/types/pos';

const PAYMENT_LABEL: Record<string, string> = { CASH: 'Espèces', CARD: 'Carte', MIXED: 'Mixte', OTHER: 'Autre' };

/** Consumes the exact same sale contract as TicketPreview — no separate
 *  total/tax calculation, purely a different layout over already-computed
 *  server totals (see docs/pos-platform/printing-architecture.md). */
export default function A4InvoicePreview({ sale, onClose }: { sale: PosSale; onClose: () => void }) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4 print:static print:bg-white print:p-0">
      <style>{'@page { size: A4 portrait; margin: 12mm; }'}</style>
      <div className="modal-pop flex max-h-[90vh] w-full max-w-2xl flex-col rounded-3xl bg-white shadow-2xl print:max-h-none print:rounded-none print:shadow-none">
        <div className="flex items-center justify-between border-b border-ink-200 p-4 print:hidden">
          <h2 className="text-lg font-black text-ink-900">Facture — Vente #{sale.saleNumber}</h2>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <div id="a4-invoice-print" className="overflow-y-auto p-10 text-sm text-ink-900">
          <div className="mb-8 flex items-start justify-between">
            <div>
              <p className="text-2xl font-black">MZALI BOUTIQUE</p>
              <p className="text-xs text-slate-500">ahmedmzaliboutique.com</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-black">Facture #{sale.saleNumber}</p>
              <p className="text-xs text-slate-500">{new Date(sale.createdAt).toLocaleString('fr-FR')}</p>
              <p className="text-xs text-slate-500">Caissier : {sale.cashierName}</p>
            </div>
          </div>

          <table className="mb-6 w-full text-left text-xs">
            <thead>
              <tr className="border-b-2 border-ink-900 text-[11px] font-black uppercase tracking-wider">
                <th className="pb-2">Article</th>
                <th className="pb-2 text-right">Qté</th>
                <th className="pb-2 text-right">Prix unitaire</th>
                <th className="pb-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {sale.lines.map((l) => (
                <tr key={l.variantId} className="border-b border-slate-200">
                  <td className="py-2 font-semibold">{l.descriptionSnapshot}</td>
                  <td className="py-2 text-right">{l.qty}</td>
                  <td className="py-2 text-right">{formatMinor(l.unitPriceMinor)}</td>
                  <td className="py-2 text-right font-bold">{formatMinor(l.lineTotalMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="ml-auto max-w-xs space-y-1.5 text-xs">
            <div className="flex justify-between"><span className="text-slate-500">Sous-total</span><span className="font-bold">{formatMinor(sale.subtotalMinor)}</span></div>
            {sale.discountMinor > 0 && (
              <div className="flex justify-between"><span className="text-slate-500">Remise</span><span className="font-bold">- {formatMinor(sale.discountMinor)}</span></div>
            )}
            <div className="flex justify-between border-t-2 border-ink-900 pt-1.5 text-base font-black"><span>TOTAL TTC</span><span>{formatMinor(sale.totalMinor)}</span></div>
            <div className="flex justify-between pt-1 text-slate-500"><span>Mode de paiement</span><span>{PAYMENT_LABEL[sale.paymentMethod ?? 'OTHER']}</span></div>
          </div>

          <p className="mt-10 text-center text-[11px] text-slate-400">TVA non applicable — vente boutique. Merci de votre confiance.</p>
        </div>

        <div className="flex gap-2 border-t border-ink-200 p-4 print:hidden">
          <button onClick={() => window.print()} className="btn-primary min-h-14 flex-1 inline-flex items-center justify-center gap-2">
            <Printer size={16} /> Imprimer la facture
          </button>
        </div>
      </div>
    </div>
  );
}
