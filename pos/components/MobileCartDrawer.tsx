'use client';
import { useState } from 'react';
import { ShoppingBag, X, Minus, Plus, Trash2, Tag } from 'lucide-react';
import { formatMinor } from '@/lib/money';
import type { CartLine, PosSaleQuote } from '@/types/pos';

export default function MobileCartDrawer({
  open,
  onClose,
  lines,
  quote,
  quoting,
  onQtyChange,
  onRemove,
  onEditLine,
  discountMinor = 0,
}: {
  open: boolean;
  onClose: () => void;
  lines: CartLine[];
  quote: PosSaleQuote | null;
  quoting: boolean;
  onQtyChange: (variantId: string, qty: number) => void;
  onRemove: (variantId: string) => void;
  onEditLine: (variantId: string) => void;
  discountMinor?: number;
}) {
  const naiveSubtotalMinor = lines.reduce((sum, l) => sum + l.unitPriceMinor * l.qty, 0);
  const subtotalMinor = quote?.subtotalMinor ?? naiveSubtotalMinor;
  const totalMinor = Math.max(0, subtotalMinor - discountMinor);
  const itemCount = lines.reduce((sum, l) => sum + l.qty, 0);

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden={!open}
      />

      {/* Bottom Sheet */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 max-h-[85vh] flex flex-col bg-white rounded-t-3xl shadow-2xl transition-transform duration-300 ease-out lg:hidden ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* Handle */}
        <div className="flex items-center justify-center pt-3 pb-2">
          <div className="w-12 h-1 bg-slate-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <ShoppingBag size={20} className="text-slate-700" />
            <h2 className="text-lg font-black text-slate-900">
              Commande en cours
            </h2>
            <span className="text-xs font-bold text-slate-500">({itemCount})</span>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 transition"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-4">
          {lines.length === 0 ? (
            <div className="grid h-48 place-items-center text-center text-slate-400">
              <div>
                <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-slate-50 border border-slate-100">
                  <ShoppingBag size={26} className="text-slate-300" />
                </div>
                <p className="font-bold text-slate-600">Panier vide</p>
                <p className="text-xs text-slate-500 mt-1">Ajoutez des produits</p>
              </div>
            </div>
          ) : (
            <ul className="space-y-3">
              {lines.map((l) => {
                const runs = quote?.lines.filter((q) => q.variantId === l.variantId) ?? [];
                const lineTotalMinor = runs.length ? runs.reduce((s, r) => s + r.lineTotalMinor, 0) : l.unitPriceMinor * l.qty;
                const regularTotalMinor = runs.length
                  ? runs.reduce((s, r) => s + (r.regularUnitPriceMinor ?? l.unitPriceMinor) * r.qty, 0)
                  : l.unitPriceMinor * l.qty;
                const savingsMinor = Math.max(0, regularTotalMinor - lineTotalMinor);
                const offerNames = [...new Set(runs.filter((r) => r.bundleName).map((r) => r.bundleName as string))];

                return (
                  <li key={l.variantId} className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                    <div className="h-14 w-14 flex-none overflow-hidden rounded-xl bg-white border border-slate-200">
                      {l.imageUrl ? (
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
                          className="grid h-7 w-7 place-items-center rounded-lg bg-white border border-slate-200 text-slate-700 active:scale-90 transition"
                        >
                          <Minus size={13} />
                        </button>
                        <span className="w-5 text-center text-xs font-black text-slate-900">{l.qty}</span>
                        <button
                          type="button"
                          onClick={() => onQtyChange(l.variantId, l.qty + 1)}
                          disabled={l.qty >= l.boutiqueAvailable}
                          className="grid h-7 w-7 place-items-center rounded-lg bg-white border border-slate-200 text-slate-700 active:scale-90 disabled:opacity-30 transition"
                        >
                          <Plus size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemove(l.variantId)}
                          className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-rose-500 hover:bg-rose-50 transition"
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

        {/* Footer Totals */}
        <div className="border-t border-slate-200 bg-slate-50/80 p-4 pb-safe">
          {quoting && (
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Calcul du prix…</p>
          )}
          {discountMinor > 0 && (
            <div className="mb-2 flex items-center justify-between text-xs font-bold text-emerald-600">
              <span>Remise fidélité</span>
              <span>-{formatMinor(discountMinor)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold text-slate-600">{itemCount} article{itemCount > 1 ? 's' : ''}</span>
            <span className="text-2xl font-black text-slate-900">{formatMinor(totalMinor)}</span>
          </div>
        </div>
      </div>
    </>
  );
}
