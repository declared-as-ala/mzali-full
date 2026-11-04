'use client';
import { Minus, Plus, ShoppingBag, Trash2, Banknote, Tag } from 'lucide-react';
import { formatMinor } from '@/lib/money';
import type { CartLine, LoyaltyAccount, PosSaleQuote, RedeemPreviewResult } from '@/types/pos';
import CustomerPanel from './CustomerPanel';

export default function Cart({
  lines, quote, quoting, onQtyChange, onRemove, onEditLine, onPay, paying, customerPanelProps,
}: {
  lines: CartLine[];
  quote: PosSaleQuote | null;
  quoting: boolean;
  onQtyChange: (variantId: string, qty: number) => void;
  onRemove: (variantId: string) => void;
  onEditLine: (variantId: string) => void;
  onPay: () => void;
  paying: boolean;
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
    <aside className="hidden lg:flex h-full w-[275px] xl:w-[295px] flex-none flex-col border-l border-slate-200 bg-white text-slate-900 shadow-xs">
      <CustomerPanel {...customerPanelProps} />

      <div className="flex-1 overflow-y-auto p-2.5">
        {lines.length === 0 ? (
          <div className="grid h-full place-items-center text-center text-slate-400">
            <div>
              <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-xl bg-slate-50 border border-slate-100 text-slate-400">
                <ShoppingBag size={20} />
              </div>
              <p className="font-black text-slate-800 text-sm">Panier vide</p>
              <p className="text-[11px] text-slate-500 mt-0.5 max-w-[160px] leading-relaxed">
                Touchez un produit pour l&apos;ajouter au panier.
              </p>
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {lines.map((l) => {
              const runs = quote?.lines.filter((q) => q.variantId === l.variantId) ?? [];
              const lineTotalMinor = runs.length ? runs.reduce((s, r) => s + r.lineTotalMinor, 0) : l.unitPriceMinor * l.qty;
              const regularTotalMinor = runs.length
                ? runs.reduce((s, r) => s + (r.regularUnitPriceMinor ?? l.unitPriceMinor) * r.qty, 0)
                : l.unitPriceMinor * l.qty;
              const savingsMinor = Math.max(0, regularTotalMinor - lineTotalMinor);
              const offerNames = [...new Set(runs.filter((r) => r.bundleName).map((r) => r.bundleName as string))];

              return (
                <li key={l.variantId} className="flex gap-2 rounded-xl border border-slate-200/90 bg-slate-50/70 p-2">
                  <div className="h-10 w-10 flex-none overflow-hidden rounded-lg bg-white border border-slate-200">
                    {l.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-slate-300">
                        <ShoppingBag size={14} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => onEditLine(l.variantId)}
                      className="block w-full text-left"
                    >
                      <p className="line-clamp-1 text-xs font-black text-slate-800 hover:text-blue-600">
                        {l.name}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {formatMinor(l.unitPriceMinor)} / unité
                      </p>
                    </button>

                    {offerNames.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {offerNames.map((name) => (
                          <span
                            key={name}
                            className="inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-800"
                          >
                            <Tag size={9} /> {name}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-1.5 flex items-center gap-1">
                      <div className="flex items-center rounded-lg border border-slate-200 bg-white shadow-2xs">
                        <button
                          type="button"
                          onClick={() => onQtyChange(l.variantId, l.qty - 1)}
                          className="grid h-6 w-6 place-items-center rounded-l-lg hover:bg-slate-100 text-slate-600 transition"
                          aria-label="Diminuer"
                        >
                          <Minus size={11} />
                        </button>
                        <span className="w-5 text-center text-xs font-black text-slate-900">
                          {l.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => onQtyChange(l.variantId, l.qty + 1)}
                          className="grid h-6 w-6 place-items-center rounded-r-lg hover:bg-slate-100 text-slate-600 transition"
                          aria-label="Augmenter"
                        >
                          <Plus size={11} />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemove(l.variantId)}
                        className="ml-auto grid h-6 w-6 place-items-center text-slate-300 hover:text-rose-600 transition"
                        title="Supprimer"
                        aria-label="Supprimer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="flex-none self-center text-right pl-1">
                    {savingsMinor > 0 && (
                      <p className="text-[9px] font-bold text-slate-400 line-through">{formatMinor(regularTotalMinor)}</p>
                    )}
                    <p className="text-xs font-black text-emerald-600 tabular-nums">{formatMinor(lineTotalMinor)}</p>
                    {savingsMinor > 0 && <p className="text-[9px] font-black text-emerald-600">-{formatMinor(savingsMinor)}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-200 bg-slate-50/80 p-2.5 sm:p-3">
        {quoting && (
          <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">Calcul…</p>
        )}
        {discountMinor > 0 && (
          <div className="mb-1.5 flex items-center justify-between text-xs font-bold text-emerald-600">
            <span>Remise fidélité</span>
            <span>-{formatMinor(discountMinor)}</span>
          </div>
        )}
        <div className="mb-2.5 flex items-center justify-between text-xs font-bold text-slate-600">
          <span className="text-[11px]">{itemCount} article{itemCount > 1 ? 's' : ''}</span>
          <span className="text-xl font-black text-slate-900 tabular-nums">{formatMinor(totalMinor)}</span>
        </div>
        <button
          type="button"
          onClick={onPay}
          disabled={lines.length === 0 || paying}
          className="group relative flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-600 font-black text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-30 disabled:pointer-events-none"
        >
          {paying ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              <span className="text-xs sm:text-sm uppercase tracking-wider">Encaissement…</span>
            </>
          ) : (
            <>
              <Banknote size={18} />
              <span className="text-xs sm:text-sm font-black tracking-wide uppercase">ENCAISSER ({formatMinor(totalMinor)})</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
