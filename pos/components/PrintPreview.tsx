'use client';
import type { PosSale } from '@/types/pos';
import A4InvoicePreview from './A4InvoicePreview';
import GiftReceiptPreview from './GiftReceiptPreview';
import type { PrintFormat } from './PrintMenu';
import TicketPreview from './TicketPreview';

export default function PrintPreview({ sale, format, onClose }: { sale: PosSale; format: PrintFormat; onClose: () => void }) {
  if (format === 'a4') return <A4InvoicePreview sale={sale} onClose={onClose} />;
  if (format === 'gift') return <GiftReceiptPreview sale={sale} onClose={onClose} />;
  return <TicketPreview sale={sale} onClose={onClose} duplicate={format === 'duplicate'} autoPrint={format === 'duplicate'} />;
}
