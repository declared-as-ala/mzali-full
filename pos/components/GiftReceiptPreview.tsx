'use client';
import { useEffect } from 'react';
import { Printer, X } from 'lucide-react';
import type { PosSale } from '@/types/pos';

/** Same ticket data as TicketPreview, deliberately without prices/totals —
 *  a gift receipt lets the recipient exchange/return without seeing what
 *  was paid. */
export default function GiftReceiptPreview({ sale, onClose }: { sale: PosSale; onClose: () => void }) {
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
          <h2 className="text-lg font-black text-ink-900">Reçu cadeau — Vente #{sale.saleNumber}</h2>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <div id="gift-receipt-print" className="overflow-y-auto p-6 font-mono text-sm text-ink-900">
          <div className="text-center">
            <p className="text-lg font-black">MZALI BOUTIQUE</p>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Reçu cadeau</p>
            <p className="text-xs">{new Date(sale.createdAt).toLocaleDateString('fr-FR')}</p>
          </div>
          <div className="my-3 border-t border-dashed border-ink-300" />
          {sale.lines.map((l) => (
            <div key={l.variantId} className="mb-1.5 flex justify-between gap-2">
              <span className="min-w-0 flex-1">{l.qty} × {l.descriptionSnapshot}</span>
            </div>
          ))}
          <div className="my-3 border-t border-dashed border-ink-300" />
          <p className="text-center text-xs">Échangeable en boutique dans les 15 jours sur présentation de ce reçu.</p>
          <p className="mt-3 text-center text-xs font-bold">Merci de votre visite !</p>
        </div>

        <div className="flex gap-2 border-t border-ink-200 p-4 print:hidden">
          <button onClick={() => window.print()} className="btn-primary min-h-14 flex-1 inline-flex items-center justify-center gap-2">
            <Printer size={16} /> Imprimer le reçu cadeau
          </button>
        </div>
      </div>
    </div>
  );
}
