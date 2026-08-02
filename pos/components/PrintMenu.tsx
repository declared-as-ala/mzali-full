'use client';
import { useState } from 'react';
import { ChevronUp, Copy, FileText, Gift, Printer, Receipt } from 'lucide-react';

export type PrintFormat = 'receipt' | 'a4' | 'gift' | 'duplicate';

const OPTIONS: { value: PrintFormat; label: string; icon: typeof Receipt }[] = [
  { value: 'receipt', label: 'Ticket de caisse', icon: Receipt },
  { value: 'a4', label: 'Facture A4', icon: FileText },
  { value: 'gift', label: 'Reçu cadeau (sans prix)', icon: Gift },
  { value: 'duplicate', label: 'Duplicata du ticket', icon: Copy },
];

/** Format picker for the four print outputs — all consume the same sale
 *  contract, this only chooses which layout renders it (see
 *  TicketPreview/A4InvoicePreview/GiftReceiptPreview). */
export default function PrintMenu({ onPick, className }: { onPick: (format: PrintFormat) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`relative ${className ?? ''}`}>
      <button onClick={() => setOpen((v) => !v)} className="btn-ghost inline-flex w-full items-center justify-center gap-2">
        <Printer size={15} /> Imprimer {open ? <ChevronUp size={13} /> : null}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-20 mb-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            {OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setOpen(false); onPick(opt.value); }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                <opt.icon size={14} className="text-slate-400" /> {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
