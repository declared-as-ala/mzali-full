'use client';
import { useEffect, useState } from 'react';
import {
  availabilityLabel, colorChoices, maxQuantity, sizesForColor, variantById,
  type LiveStock, type LiveVariant,
} from '@/lib/order-stock';

/** Minimal shape of an order line the stock UI needs (the drawer's LineDraft satisfies it). */
export type StockLine = { key: string; productId: string; variantId?: string | null; qty: number; variation: Record<string, string> };

export type StockCtx<L extends StockLine = StockLine> = {
  stocks: Record<string, LiveStock | undefined>;
  /** Units of this variant the saved (already deducted) order holds. */
  held: (productId: string, variantId?: string | null) => number;
  /** Per-line message: quantity clamp, stock changed while open, or a save-time refusal. */
  notices: Record<string, string>;
  onQty: (line: L, value: number) => void;
  onPickVariant: (line: L, variant: LiveVariant) => void;
};

const plural = (n: number) => (n > 1 ? 's' : '');

/** "Stock total : 31 unités" under the product name; red ÉPUISÉ when nothing is left. */
export function StockTotalNote({ stock }: { stock?: LiveStock }) {
  if (!stock || !stock.tracked) return null;
  return stock.total <= 0
    ? <span className="mt-0.5 block text-[11px] font-black text-red-600">ÉPUISÉ</span>
    : <span className="mt-0.5 block text-[11px] font-bold text-emerald-700">Stock total : {stock.total} unité{plural(stock.total)}</span>;
}

/** Under the quantity box: the limit (or the reason the value was changed). */
export function LineQtyNote<L extends StockLine>({ l, ctx }: { l: L; ctx: StockCtx<L> }) {
  const notice = ctx.notices[l.key];
  const max = maxQuantity(ctx.stocks[l.productId], l, ctx.held(l.productId, l.variantId));
  if (notice) return <p role="alert" className="mt-1 max-w-[9rem] text-[11px] font-bold leading-tight text-red-600">{notice}</p>;
  if (max === null) return null;
  return <p className={`mt-1 text-[10px] font-semibold ${max <= 0 ? 'text-red-600' : 'text-ink-500'}`}>max {max}</p>;
}

/**
 * Variant cell of an order line. Products with variants get the live picker
 * (color -> size, with exact counts); products without variants show their single quantity.
 * `fallback` is the legacy attribute selector for products that have no exact variants.
 */
export function LineVariant<L extends StockLine>({ l, ctx, matrix, fallback }: { l: L; ctx: StockCtx<L>; matrix: boolean; fallback: React.ReactNode }) {
  const stock = ctx.stocks[l.productId];
  if (matrix) {
    if (!stock) return <span className="text-xs font-semibold text-ink-500">Chargement du stock…</span>;
    return <VariantStockPicker line={l} stock={stock} onPick={(v) => ctx.onPickVariant(l, v)} />;
  }
  return (
    <div className="space-y-1.5">
      {fallback}
      {stock?.tracked && (
        <p className={`text-[11px] font-bold ${stock.total <= 0 ? 'text-red-600' : 'text-emerald-700'}`}>
          {stock.total <= 0 ? 'ÉPUISÉ' : `${stock.total} disponible${plural(stock.total)}`}
        </p>
      )}
    </div>
  );
}

const norm = (v: string) => v.trim().normalize('NFC').toLocaleLowerCase('fr');

function VariantStockPicker({ line, stock, onPick }: { line: StockLine; stock: LiveStock; onPick: (v: LiveVariant) => void }) {
  const chosen = variantById(stock, line.variantId);
  const [color, setColor] = useState<string>(chosen?.color ?? '');
  useEffect(() => { if (chosen) setColor(chosen.color); }, [chosen?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const colors = colorChoices(stock);
  // A single color needs no choosing.
  const activeColor = color || (colors.length === 1 ? colors[0].color : '');
  const sizes = activeColor ? sizesForColor(stock, activeColor) : [];
  const lineIsStale = Boolean(line.variantId && !chosen?.active);

  if (!colors.length) return <span className="text-xs font-bold text-red-600">Aucune variante en vente</span>;

  return (
    <div className="min-w-[13rem] space-y-2">
      {lineIsStale && (
        <p className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800">Cette variante n’est plus en vente : choisissez-en une autre.</p>
      )}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Couleur">
        {colors.map((c) => (
          <button
            key={norm(c.color)}
            type="button"
            aria-pressed={norm(activeColor) === norm(c.color)}
            disabled={c.soldOut}
            onClick={() => setColor(c.color)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
              c.soldOut ? 'cursor-not-allowed border-red-200 bg-red-50 text-red-500 line-through'
                : norm(activeColor) === norm(c.color) ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-ink-200 bg-white text-ink-900 hover:border-brand-300'
            }`}
            title={c.soldOut ? 'Toutes les tailles sont épuisées' : `${c.available} disponibles`}
          >
            {c.color || 'Standard'}{c.soldOut ? ' — ÉPUISÉ' : ''}
          </button>
        ))}
      </div>

      {activeColor ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Taille">
          {sizes.map((v) => {
            const out = v.available <= 0;
            const selected = v.id === line.variantId;
            return (
              <button
                key={v.id}
                type="button"
                disabled={out}
                aria-pressed={selected}
                aria-label={`${v.size || 'Standard'} — ${availabilityLabel(v.available)}`}
                onClick={() => onPick(v)}
                className={`flex min-w-[3.6rem] flex-col items-center rounded-lg border px-2 py-1 text-xs transition ${
                  out ? 'cursor-not-allowed border-red-200 bg-red-50 text-red-500'
                    : selected ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500'
                    : 'border-ink-200 bg-white text-ink-900 hover:border-brand-300'
                }`}
              >
                <span className={`font-black ${out ? 'line-through' : ''}`}>{v.size || 'Standard'}</span>
                <span className={`text-[10px] font-bold ${out ? 'text-red-600' : v.available <= 3 ? 'text-amber-700' : 'text-emerald-700'}`}>{availabilityLabel(v.available)}</span>
              </button>
            );
          })}
          {!sizes.length && <span className="text-[11px] font-semibold text-ink-500">Aucune taille en vente pour cette couleur.</span>}
        </div>
      ) : (
        <p className="text-[11px] font-semibold text-ink-500">Choisissez une couleur.</p>
      )}

      {chosen && chosen.active && (
        <p className={`text-[11px] font-black ${chosen.available <= 0 ? 'text-red-600' : 'text-emerald-700'}`}>
          {chosen.size || 'Standard'} / {chosen.color || 'Standard'} — {availabilityLabel(chosen.available)}
        </p>
      )}
    </div>
  );
}
