'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle, Banknote, Printer, X } from 'lucide-react';
import { formatMinor } from '@/lib/money';
import type { PosSale, PosSalePaymentInput } from '@/types/pos';
import QRCodeSvg from './QRCodeSvg';

const WEBSITE_URL = 'https://ahmedmzaliboutique.tn/';

const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'Espèces',
  CARD: 'Carte bancaire',
  BANK_TRANSFER: 'Virement bancaire',
  MIXED: 'Paiement mixte',
  OTHER: 'Autre',
};

function paymentRows(sale: PosSale): PosSalePaymentInput[] {
  if (sale.payments.length > 0) return sale.payments;
  return sale.paymentMethod
    ? [{ method: sale.paymentMethod === 'MIXED' ? 'OTHER' : sale.paymentMethod, amountMinor: sale.totalMinor }]
    : [];
}

/** One template is used for the on-screen preview and printed output. */
export default function TicketPreview({ sale, onClose, onNewSale, duplicate, autoPrint, hardwareWarning, canOpenDrawer, onOpenDrawer, drawerBusy }: {
  sale: PosSale;
  onClose: () => void;
  onNewSale?: () => void;
  duplicate?: boolean;
  autoPrint?: boolean;
  hardwareWarning?: string | null;
  canOpenDrawer?: boolean;
  onOpenDrawer?: () => void;
  drawerBusy?: boolean;
}) {
  useEffect(() => {
    document.body.classList.add('receipt-printing');
    return () => document.body.classList.remove('receipt-printing');
  }, []);

  // onNewSale/onClose are inline closures from Till.tsx and get a new
  // identity on every one of its re-renders (e.g. a live pos-events update
  // arriving mid-print). Reading them via a ref instead of a dependency
  // keeps this effect's own deps stable across those re-renders — putting
  // them in the dependency array previously meant any re-render during the
  // 150ms print delay tore the effect down (cancelling the still-pending
  // window.print() via cleanup) and immediately restarted it, which then
  // saw the sessionStorage flag already set from the aborted first pass
  // and dismissed the screen without ever printing anything.
  const dismissRef = useRef<() => void>(() => {});
  dismissRef.current = onNewSale ?? onClose;

  // A completed sale prints itself and opens the drawer with no manual step
  // — this screen shouldn't need one either. Once the browser's print flow
  // resolves (ticket printed, or the dialog dismissed), go straight back to
  // a fresh sale automatically instead of waiting on a "Nouvelle vente"
  // click. `afterprint` is the standard cross-browser signal that the print
  // dialog closed; a fallback timer guards against it never firing on some
  // platform/printer setup so the cashier is never stuck on this screen.
  useEffect(() => {
    if (!autoPrint) return;
    const printKey = `pos_auto_printed_${sale.id}`;
    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      dismissRef.current();
    };

    if (sessionStorage.getItem(printKey)) {
      dismiss();
      return;
    }
    sessionStorage.setItem(printKey, '1');

    window.addEventListener('afterprint', dismiss);
    const printId = setTimeout(() => window.print(), 150);
    const fallbackId = setTimeout(dismiss, 6000);

    return () => {
      clearTimeout(printId);
      clearTimeout(fallbackId);
      window.removeEventListener('afterprint', dismiss);
    };
  }, [autoPrint, sale.id]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const merchantLegalName = sale.merchant?.legalName?.trim();
  const transactionDate = sale.completedAt || sale.createdAt;
  const grossItemsMinor = sale.lines.reduce((sum, line) => sum + line.unitPriceMinor * line.qty, 0);
  const lineDiscountMinor = sale.lines.reduce((sum, line) => sum + line.discountMinor, 0);
  const payments = paymentRows(sale);

  return (
    <div className="receipt-print-shell fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
      <style>{'@page { size: 80mm auto; margin: 0; }'}</style>
      <div className="receipt-preview-dialog modal-pop flex max-h-[90vh] w-full max-w-sm flex-col rounded-3xl bg-white shadow-2xl">
        <div className="receipt-screen-only flex items-center justify-between border-b border-ink-200 p-4">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-blue-600">Aperçu du ticket</p>
            <h2 className="text-lg font-black text-ink-900">Vente #{sale.saleNumber}</h2>
          </div>
          <button onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl text-ink-500 hover:bg-ink-100" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <article id="ticket-print" className="receipt-print" aria-label={`Ticket de caisse ${sale.saleNumber}`}>
          {duplicate && <p className="receipt-duplicate">DUPLICATA</p>}

          <header className="receipt-header">
            <h1>MZALI BOUTIQUE</h1>
            {merchantLegalName && merchantLegalName.toLocaleUpperCase('fr-FR') !== 'MZALI BOUTIQUE' && <p>{merchantLegalName}</p>}
            {sale.merchant?.address && <p>{sale.merchant.address}</p>}
            {sale.merchant?.phone && <p>Tél. : {sale.merchant.phone}</p>}
            {sale.merchant?.matriculeFiscal && <p>Matricule fiscal : {sale.merchant.matriculeFiscal}</p>}
            {sale.merchant?.rcNumber && <p>R.C. : {sale.merchant.rcNumber}</p>}
          </header>

          <div className="receipt-separator" />

          <section className="receipt-meta">
            <h2>TICKET DE CAISSE</h2>
            <dl>
              <div><dt>Ticket</dt><dd>#{sale.saleNumber}</dd></div>
              <div><dt>Date</dt><dd>{new Date(transactionDate).toLocaleString('fr-FR')}</dd></div>
              {sale.cashierName && <div><dt>Caissier</dt><dd>{sale.cashierName}</dd></div>}
              {(sale.customerName || sale.customerPhone) && (
                <div><dt>Client</dt><dd>{[sale.customerName, sale.customerPhone].filter(Boolean).join(' · ')}</dd></div>
              )}
            </dl>
          </section>

          <div className="receipt-separator" />

          <section className="receipt-items" aria-label="Articles">
            {sale.lines.map((line, index) => {
              const attributes = Object.entries(line.variantAttributesSnapshot ?? {});
              const regularLineTotalMinor = line.regularUnitPriceMinor != null ? line.regularUnitPriceMinor * line.qty : null;
              const offerSavingsMinor = line.bundleId && regularLineTotalMinor != null
                ? Math.max(0, regularLineTotalMinor - (line.lineTotalMinor + line.discountMinor))
                : 0;
              return (
                <div key={`${line.variantId}-${index}`} className="receipt-item">
                  <p className="receipt-item-name">{line.descriptionSnapshot} × {line.qty}</p>
                  {(line.sku || attributes.length > 0) && (
                    <p className="receipt-item-detail">
                      {[line.sku ? `Réf. ${line.sku}` : '', ...attributes.map(([label, value]) => `${label}: ${value}`)]
                        .filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {line.bundleId && regularLineTotalMinor != null ? (
                    <>
                      <div className="receipt-item-price">
                        <span>Prix normal</span>
                        <span>{formatMinor(regularLineTotalMinor)}</span>
                      </div>
                      {offerSavingsMinor > 0 && (
                        <div className="receipt-item-discount">
                          <span>Offre {line.bundleName}</span><span>−{formatMinor(offerSavingsMinor)}</span>
                        </div>
                      )}
                      <div className="receipt-item-price">
                        <span>Total</span>
                        <strong>{formatMinor(line.lineTotalMinor)}</strong>
                      </div>
                    </>
                  ) : (
                    <div className="receipt-item-price">
                      <span>{line.qty} × {formatMinor(line.unitPriceMinor)}</span>
                      <strong>{formatMinor(line.lineTotalMinor)}</strong>
                    </div>
                  )}
                  {line.discountMinor > 0 && (
                    <div className="receipt-item-discount">
                      <span>Remise article</span><span>−{formatMinor(line.discountMinor)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          <div className="receipt-separator" />

          <section className="receipt-totals" aria-label="Totaux">
            <div><span>Sous-total articles</span><span>{formatMinor(grossItemsMinor)}</span></div>
            {lineDiscountMinor > 0 && <div><span>Remises articles</span><span>−{formatMinor(lineDiscountMinor)}</span></div>}
            {lineDiscountMinor > 0 && <div><span>Sous-total</span><span>{formatMinor(sale.subtotalMinor)}</span></div>}
            {sale.discountMinor > 0 && <div><span>Remise</span><span>−{formatMinor(sale.discountMinor)}</span></div>}
            <div className="receipt-grand-total"><span>TOTAL</span><span>{formatMinor(sale.totalMinor)}</span></div>
          </section>

          <section className="receipt-payments" aria-label="Paiement">
            {payments.map((payment, index) => (
              <div key={`${payment.method}-${index}`}>
                <span>{PAYMENT_LABEL[payment.method] ?? payment.method}</span>
                <span>{formatMinor(payment.amountMinor)}</span>
              </div>
            ))}
            {sale.cashReceivedMinor !== null && (
              <div><span>Montant reçu</span><span>{formatMinor(sale.cashReceivedMinor)}</span></div>
            )}
            {sale.changeMinor !== null && (
              <div className="receipt-change"><span>Monnaie rendue</span><span>{formatMinor(sale.changeMinor)}</span></div>
            )}
          </section>

          {(sale.loyaltyPointsEarned > 0 || sale.loyaltyPointsRedeemed > 0) && (
            <section className="receipt-loyalty" aria-label="Fidélité">
              {sale.loyaltyPointsRedeemed > 0 && (
                <div><span>Points utilisés</span><span>−{sale.loyaltyPointsRedeemed} ({formatMinor(sale.loyaltyDiscountMinor)})</span></div>
              )}
              {sale.loyaltyPointsEarned > 0 && <div><span>Points gagnés</span><span>+{sale.loyaltyPointsEarned}</span></div>}
            </section>
          )}

          {sale.notes && <p className="receipt-note"><strong>Note :</strong> {sale.notes}</p>}

          <div className="receipt-separator" />

          <footer className="receipt-footer">
            <div className="receipt-qr"><QRCodeSvg value={WEBSITE_URL} size={120} /></div>
            <p className="receipt-thanks">Merci pour votre confiance.</p>
            <p>Retrouvez-nous sur ahmedmzaliboutique.tn</p>
            <p>Conservez ce ticket comme preuve d&apos;achat.</p>
          </footer>
        </article>

        {hardwareWarning && (
          <div className="receipt-screen-only mx-4 mb-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-950" role="alert">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 shrink-0" size={17} />
              <div className="min-w-0 flex-1">
                <p className="font-black">Vente enregistrée — attention au tiroir</p>
                <p className="mt-0.5">{hardwareWarning}</p>
                {canOpenDrawer && onOpenDrawer && (
                  <button type="button" disabled={drawerBusy} onClick={onOpenDrawer} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-400 bg-white px-3 font-black transition hover:bg-amber-100 disabled:opacity-60">
                    <Banknote size={15} /> {drawerBusy ? 'Ouverture…' : 'Ouvrir le tiroir'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="receipt-screen-only flex gap-2 border-t border-ink-200 p-4">
          <button onClick={() => window.print()} className="btn-ghost min-h-14 flex-1">
            <Printer size={16} /> {duplicate ? 'Réimprimer' : 'Imprimer'}
          </button>
          {onNewSale && <button onClick={onNewSale} className="btn-primary min-h-14 flex-1">Nouvelle vente</button>}
        </div>
      </div>
    </div>
  );
}
