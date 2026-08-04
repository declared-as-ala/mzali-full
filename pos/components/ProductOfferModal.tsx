'use client';
import { useState } from 'react';
import { Check, Minus, Plus, ShoppingBag, Tag, X } from 'lucide-react';
import { formatMinor } from '@/lib/money';
import type { PosCatalogItem } from '@/types/pos';

/**
 * "Offres disponibles" — shown when a product has configured quantity
 * offers. Purely informational/selection UI: picking an offer just sets the
 * quantity added to the cart. The actual price (including automatically
 * combining offers as the cart's total quantity for this product grows) is
 * always computed server-side via /api/sales/quote — see Till.tsx's
 * fetchQuote() and product-pricing.ts on the backend. Never priced here.
 */
export default function ProductOfferModal({ item, onClose, onAdd }: {
  item: PosCatalogItem;
  onClose: () => void;
  onAdd: (qty: number) => void;
}) {
  const offers = item.bundles.filter((b) => b.quantity >= 2);
  const [qty, setQty] = useState(offers[0]?.quantity ?? 1);
  const maxQty = Math.max(1, item.boutiqueAvailable);

  function selectOffer(offerQty: number) {
    setQty(Math.min(offerQty, maxQty));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-100 p-5">
          <div className="h-14 w-14 flex-none overflow-hidden rounded-2xl bg-slate-100">
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center text-slate-300"><ShoppingBag size={20} /></div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-slate-900">{item.name}</p>
            <p className="text-xs font-bold text-slate-500">{formatMinor(item.priceMinor)} / unité</p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 flex-none place-items-center rounded-xl text-slate-400 hover:bg-slate-100" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {offers.length > 0 && (
            <>
              <div className="mb-3 flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-blue-700">
                <Tag size={13} /> Offres disponibles
              </div>
              <div className="mb-5 space-y-2">
                {offers.map((offer) => {
                  const normalTotalMinor = offer.regularPriceMinor > 0 ? offer.regularPriceMinor : offer.priceMinor;
                  const savingsMinor = Math.max(0, normalTotalMinor - offer.priceMinor);
                  const selected = qty === offer.quantity;
                  return (
                    <button
                      key={offer.id}
                      type="button"
                      onClick={() => selectOffer(offer.quantity)}
                      disabled={offer.quantity > maxQty}
                      className={`flex w-full items-center justify-between rounded-2xl border-2 p-3.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                        selected ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-200'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-black text-slate-900">
                          {offer.quantity} articles — {formatMinor(offer.priceMinor)}
                        </p>
                        <p className="text-xs font-semibold text-slate-500">
                          {offer.label || offer.name}
                          {savingsMinor > 0 && (
                            <>
                              {' '}au lieu de <span className="line-through">{formatMinor(normalTotalMinor)}</span>
                              {' '}<span className="text-emerald-600">— Économie {formatMinor(savingsMinor)}</span>
                            </>
                          )}
                        </p>
                      </div>
                      {selected && (
                        <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-blue-600 text-white">
                          <Check size={14} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <span className="text-xs font-black uppercase tracking-wide text-slate-600">Quantité</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 active:scale-90 transition"
                aria-label="Diminuer"
              >
                <Minus size={15} />
              </button>
              <span className="w-8 text-center text-base font-black text-slate-900">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(q + 1, maxQty))}
                disabled={qty >= maxQty}
                className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 active:scale-90 disabled:opacity-30 transition"
                aria-label="Augmenter"
              >
                <Plus size={15} />
              </button>
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] font-semibold text-slate-400">
            Le meilleur prix disponible est appliqué automatiquement au panier.
          </p>
        </div>

        <div className="border-t border-slate-100 p-5">
          <button
            type="button"
            onClick={() => onAdd(qty)}
            className="flex h-13 w-full items-center justify-center rounded-2xl bg-blue-600 text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 active:scale-[0.99]"
          >
            Ajouter au panier
          </button>
        </div>
      </div>
    </div>
  );
}
