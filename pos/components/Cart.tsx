'use client';
import { Minus, Plus, ShoppingBag, Trash2, Banknote, Tag } from 'lucide-react';
import { formatMinor } from '@/lib/money';
import type { CartLine, LoyaltyAccount, PosCatalogItem, PosCatalogResponse, PosSaleQuote, RedeemPreviewResult } from '@/types/pos';
import CustomerPanel from './CustomerPanel';
import SuggestionsRail from './SuggestionsRail';

export default function Cart({
  lines, quote, quoting, onQtyChange, onRemove, onEditLine, onPay, catalog, onAddSuggestion, customerPanelProps,
}: {
  lines: CartLine[];
  /** Authoritative offer-adjusted pricing for the current cart — see
   *  Till.tsx's fetchQuote(). Null while the first quote hasn't landed yet;
   *  every price shown here falls back to a naive qty*unitPrice estimate
   *  until then, never computed by this component. */
  quote: PosSaleQuote | null;
  quoting: boolean;
  onQtyChange: (variantId: string, qty: number) => void;
  onRemove: (variantId: string) => void;
  /** Opens the offer/quantity picker for this line — the only place the
   *  popup appears once added, since a plain click on a product just adds
   *  or bumps qty directly (supermarket-style scanning, no popup). */
  onEditLine: (variantId: string) => void;
  onPay: () => void;
  catalog: PosCatalogResponse | null;
  onAddSuggestion: (item: PosCatalogItem) => void;
  customerPanelProps: {
    phone: string;
    onPhoneChange: (v: string) => void;
    onLookup: () => void;
    looking: boolean;
    customerId: string | null;
    customerName: string | null;
    account: LoyaltyAccount | null;
    notFound: boolean;
    onCreateAccount: (firstName: string) => void;
    creating: boolean;
    redeemInput: string;
    onRedeemInputChange: (v: string) => void;
    onPreviewRedeem: () => void;
    previewing: boolean;
    preview: RedeemPreviewResult | null;
    managerEmployeeId: string;
    managerPassword: string;
    onManagerChange: (employeeId: string, password: string) => void;
    cardNumber: string;
    onCardNumberChange: (v: string) => void;
    onCardLookup: () => void;
    cardLooking: boolean;
    cardUnassigned: boolean;
    onAssignCard: (cardNumber: string, phone: string, firstName?: string, lastName?: string) => Promise<boolean>;
    cardAssigning: boolean;
  };
}) {
  const naiveSubtotalMinor = lines.reduce((sum, l) => sum + l.unitPriceMinor * l.qty, 0);
  const subtotalMinor = quote?.subtotalMinor ?? naiveSubtotalMinor;
  const discountMinor = customerPanelProps.preview?.valid ? customerPanelProps.preview.discountMinor : 0;
  const totalMinor = Math.max(0, subtotalMinor - discountMinor);
  const itemCount = lines.reduce((sum, l) => sum + l.qty, 0);

  return (
    <aside className="flex h-full w-full max-w-sm flex-none flex-col border-l border-slate-200 bg-white text-slate-900 shadow-sm">
      <CustomerPanel {...customerPanelProps} />

      <div className="flex-1 overflow-y-auto p-4">
        {lines.length === 0 ? (
          <div className="grid h-full place-items-center text-center text-slate-400">
            <div>
              <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-slate-50 border border-slate-100 text-slate-400">
                <ShoppingBag size={26} />
              </div>
              <p className="font-extrabold text-slate-800 text-base">Panier vide</p>
              <p className="text-xs text-slate-500 mt-1 max-w-[200px] leading-relaxed">
                Touchez un produit dans le catalogue pour l&apos;ajouter au panier.
              </p>
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {lines.map((l) => {
              // A single cart line can price as more than one run once the
              // qty crosses an offer boundary (e.g. 3 units with only a
              // 2-for-45 offer configured: 2 at the offer price + 1 at
              // regular) — see distributeGroupPricing() on the backend.
              const runs = quote?.lines.filter((q) => q.variantId === l.variantId) ?? [];
              const lineTotalMinor = runs.length ? runs.reduce((s, r) => s + r.lineTotalMinor, 0) : l.unitPriceMinor * l.qty;
              const regularTotalMinor = runs.length
                ? runs.reduce((s, r) => s + (r.regularUnitPriceMinor ?? l.unitPriceMinor) * r.qty, 0)
                : l.unitPriceMinor * l.qty;
              const savingsMinor = Math.max(0, regularTotalMinor - lineTotalMinor);
              const offerNames = [...new Set(runs.filter((r) => r.bundleName).map((r) => r.bundleName as string))];

              return (
                <li key={l.variantId} className="flex gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3">
                  <div className="h-14 w-14 flex-none overflow-hidden rounded-xl bg-white border border-slate-200">
                    {l.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-slate-300">
                        <ShoppingBag size={18} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => onEditLine(l.variantId)}
                      className="block w-full text-left"
                      aria-label={`Modifier ${l.name}`}
                    >
                      <p className="truncate text-xs font-bold text-slate-900">{l.name}</p>
                      {offerNames.length > 0 ? (
                        <p className="flex items-center gap-1 text-[11px] font-black text-blue-600">
                          <Tag size={10} /> {offerNames.join(', ')}
                        </p>
                      ) : (
                        <p className="text-[11px] font-semibold text-slate-500">{formatMinor(l.unitPriceMinor)} / unité</p>
                      )}
                    </button>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onQtyChange(l.variantId, l.qty - 1)}
                        className="grid h-7 w-7 place-items-center rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 active:scale-90 transition"
                        aria-label="Diminuer"
                      >
                        <Minus size={13} />
                      </button>
                      <span className="w-5 text-center text-xs font-black text-slate-900">{l.qty}</span>
                      <button
                        type="button"
                        onClick={() => onQtyChange(l.variantId, l.qty + 1)}
                        disabled={l.qty >= l.boutiqueAvailable}
                        className="grid h-7 w-7 place-items-center rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 active:scale-90 disabled:opacity-30 transition"
                        aria-label="Augmenter"
                      >
                        <Plus size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(l.variantId)}
                        className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-rose-500 hover:bg-rose-50 transition"
                        aria-label="Retirer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="flex-none self-center text-right">
                    {savingsMinor > 0 && (
                      <p className="text-[10px] font-bold text-slate-400 line-through">{formatMinor(regularTotalMinor)}</p>
                    )}
                    <p className="text-xs font-black text-emerald-600">{formatMinor(lineTotalMinor)}</p>
                    {savingsMinor > 0 && <p className="text-[10px] font-black text-emerald-600">-{formatMinor(savingsMinor)}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {lines.length > 0 && (
        <SuggestionsRail
          forVariantId={lines[lines.length - 1].variantId}
          catalog={catalog}
          cartVariantIds={new Set(lines.map((l) => l.variantId))}
          onAdd={onAddSuggestion}
        />
      )}

      <div className="border-t border-slate-200 bg-slate-50/80 p-4">
        {quoting && (
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Calcul du prix…</p>
        )}
        {discountMinor > 0 && (
          <div className="mb-2 flex items-center justify-between text-xs font-bold text-emerald-600">
            <span>Remise fidélité</span>
            <span>-{formatMinor(discountMinor)}</span>
          </div>
        )}
        <div className="mb-4 flex items-center justify-between text-xs font-bold text-slate-600">
          <span>{itemCount} article{itemCount > 1 ? 's' : ''}</span>
          <span className="text-2xl font-black text-slate-900">{formatMinor(totalMinor)}</span>
        </div>
        <button
          type="button"
          onClick={onPay}
          disabled={lines.length === 0}
          className="group relative flex h-14 w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl bg-emerald-600 font-black text-white shadow-xl shadow-emerald-600/20 transition hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-30 disabled:pointer-events-none"
        >
          <Banknote size={20} />
          <span className="text-base uppercase tracking-wider">ENCAISSER ESPÈCES ({formatMinor(totalMinor)})</span>
        </button>
      </div>
    </aside>
  );
}
