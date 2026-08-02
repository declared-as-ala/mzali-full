'use client';

import { useEffect } from 'react';
import { Globe, Printer, X } from 'lucide-react';
import { formatMinor } from '@/lib/money';
import type { PosSale } from '@/types/pos';
import QRCodeSvg from './QRCodeSvg';

const WEBSITE_URL = 'https://ahmedmzaliboutique.com/';

const PAYMENT_LABEL: Record<string, string> = { CASH: 'Espèces', CARD: 'Carte', MIXED: 'Mixte', OTHER: 'Autre' };

/** Used for both the on-screen preview and the printed output — one
 *  template, so what the cashier sees is exactly what prints
 *  (docs/pos-platform/printing-architecture.md). `onNewSale` is optional —
 *  when omitted (reprint/duplicate views from the dashboard or history
 *  page, not a live checkout), that action is simply not offered.
 *  `duplicate` stamps a visible "DUPLICATA" marker, matching the "reprint
 *  a receipt" behavior that real POS hardware/software produces. */
export default function TicketPreview({ sale, onClose, onNewSale, duplicate, autoPrint }: {
  sale: PosSale; onClose: () => void; onNewSale?: () => void; duplicate?: boolean; autoPrint?: boolean;
}) {
  useEffect(() => {
    if (autoPrint) {
      const id = setTimeout(() => window.print(), 150);
      return () => clearTimeout(id);
    }
  }, [autoPrint]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4 print:static print:bg-white print:p-0">
      <div className="modal-pop flex max-h-[90vh] w-full max-w-sm flex-col rounded-3xl bg-white shadow-2xl print:max-h-none print:rounded-none print:shadow-none">
        <div className="flex items-center justify-between border-b border-ink-200 p-4 print:hidden">
          <h2 className="text-lg font-black text-ink-900">Vente #{sale.saleNumber}</h2>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <div id="ticket-print" className="overflow-y-auto p-6 font-mono text-sm text-ink-900">
          {duplicate && (
            <p className="mb-2 rounded-lg border-2 border-dashed border-slate-400 py-1 text-center text-xs font-black tracking-widest text-slate-500">
              DUPLICATA
            </p>
          )}
          <div className="text-center">
            <p className="text-lg font-black">MZALI BOUTIQUE</p>
            <p className="text-xs">Vente #{sale.saleNumber}</p>
            <p className="text-xs">{new Date(sale.createdAt).toLocaleString('fr-FR')}</p>
            <p className="text-xs">Caissier : {sale.cashierName}</p>
          </div>
          <div className="my-3 border-t border-dashed border-ink-300" />
          {sale.lines.map((l) => (
            <div key={l.variantId} className="mb-1.5 flex justify-between gap-2">
              <span className="min-w-0 flex-1">
                {l.qty} × {l.descriptionSnapshot}
              </span>
              <span className="flex-none font-bold">{formatMinor(l.lineTotalMinor)}</span>
            </div>
          ))}
          <div className="my-3 border-t border-dashed border-ink-300" />
          <div className="flex justify-between font-black">
            <span>TOTAL</span>
            <span>{formatMinor(sale.totalMinor)}</span>
          </div>
          <div className="mt-2 flex justify-between text-xs">
            <span>{PAYMENT_LABEL[sale.paymentMethod ?? 'OTHER']}</span>
            {sale.cashReceivedMinor !== null && <span>Reçu : {formatMinor(sale.cashReceivedMinor)}</span>}
          </div>
          {sale.changeMinor !== null && sale.changeMinor > 0 && (
            <div className="flex justify-between text-xs font-bold">
              <span>Monnaie rendue</span>
              <span>{formatMinor(sale.changeMinor)}</span>
            </div>
          )}
          {(sale.loyaltyPointsEarned > 0 || sale.loyaltyPointsRedeemed > 0) && (
            <>
              <div className="my-3 border-t border-dashed border-ink-300" />
              {sale.loyaltyPointsRedeemed > 0 && (
                <div className="flex justify-between text-xs">
                  <span>Points échangés</span>
                  <span>-{sale.loyaltyPointsRedeemed} ({formatMinor(sale.loyaltyDiscountMinor)})</span>
                </div>
              )}
              {sale.loyaltyPointsEarned > 0 && (
                <div className="flex justify-between text-xs font-bold">
                  <span>Points gagnés</span>
                  <span>+{sale.loyaltyPointsEarned}</span>
                </div>
              )}
            </>
          )}
          <div className="my-3 border-t border-dashed border-ink-300" />
          <div className="text-center space-y-2 py-1">
            <p className="text-xs font-bold">Merci de votre visite !</p>
            <div className="flex flex-col items-center justify-center gap-1.5 pt-1">
              <div className="p-2 bg-white border border-slate-200 rounded-xl shadow-xs inline-block">
                <QRCodeSvg value={WEBSITE_URL} size={105} />
              </div>
              <p className="text-[11px] font-bold text-slate-700">Visitez notre site web :</p>
              <p className="text-[10px] font-bold tracking-tight text-blue-700 underline break-all max-w-[240px]">
                {WEBSITE_URL}
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-2 border-t border-ink-200 p-4 print:hidden">
          <button onClick={() => window.print()} className="btn-ghost min-h-14 flex-1 inline-flex items-center justify-center gap-2">
            <Printer size={16} /> {duplicate ? 'Réimprimer' : 'Imprimer'}
          </button>
          {onNewSale && (
            <button onClick={onNewSale} className="btn-primary min-h-14 flex-1">
              Nouvelle vente
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
