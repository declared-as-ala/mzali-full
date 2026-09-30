'use client';
import { useEffect, useState } from 'react';
import {
  availabilityLabel, axesOf, changeSelection, colorOptions, maxQuantity, matchLegacy, resolveVariant, selectionOf, sizeOptions, variantById,
  type AxisChoice, type LiveStock, type LiveVariant, type Selection,
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
  /** The selection no longer resolves to a variant: forget the previous one. */
  onClearVariant: (line: L) => void;
};

const plural = (n: number) => (n > 1 ? 's' : '');
const norm = (v: string) => v.trim().normalize('NFC').toLocaleLowerCase('fr');

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
    return <ProductVariantSelector line={l} stock={stock} ctx={ctx} />;
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

/**
 * ProductVariantSelector: ONE reusable component for every order line (create, edit, bundle slot).
 * Two selects — Couleur and Taille — filter each other and resolve one REAL variant (never text).
 * An axis the product does not have is not shown; sold-out values are red and disabled.
 */
function ProductVariantSelector<L extends StockLine>({ line, stock, ctx }: { line: L; stock: LiveStock; ctx: StockCtx<L> }) {
  const axes = axesOf(stock);
  const saved = variantById(stock, line.variantId);
  const legacy = !line.variantId ? matchLegacy(stock, line.variation) : undefined; // display only, nothing is written
  const current = saved ?? legacy;
  const [sel, setSel] = useState<Selection>(selectionOf(current));
  useEffect(() => { setSel(selectionOf(saved ?? legacy)); }, [saved?.id, legacy?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const colors = axes.color ? colorOptions(stock, sel.size) : [];
  const sizes = axes.size ? sizeOptions(stock, sel.color) : [];
  const resolved = resolveVariant(stock, sel);
  const staleSaved = Boolean(line.variantId && !saved?.active);
  const historical = !line.variantId && !legacy && Object.values(line.variation).some(Boolean)
    ? Object.values(line.variation).filter(Boolean).join(' / ') : '';

  function change(axis: 'color' | 'size', value: string) {
    const next = changeSelection(stock, sel, axis, value);
    setSel(next);
    const v = resolveVariant(stock, next);
    if (v && v.available > 0) { if (v.id !== line.variantId) ctx.onPickVariant(line, v); }
    else if (line.variantId) ctx.onClearVariant(line); // the old variant no longer matches what is selected
  }

  if (!axes.color && !axes.size) return <span className="text-xs font-bold text-red-600">Aucune variante en vente</span>;

  const label = (c: AxisChoice) => `${c.value}${c.soldOut ? ' — ÉPUISÉ' : ` — ${availabilityLabel(c.available)}`}`;
  const select = (axis: 'color' | 'size', title: string, options: AxisChoice[]) => (
    <label className="block">
      <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-ink-500">{title}</span>
      <select
        aria-label={title}
        value={sel[axis]}
        onChange={(e) => change(axis, e.target.value)}
        className={`h-9 w-full min-w-[9.5rem] rounded-lg border bg-white px-2 text-xs font-bold outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50 ${sel[axis] ? 'border-brand-300 text-brand-700' : 'border-ink-200 text-ink-700'}`}
      >
        <option value="">Sélectionner {axis === 'color' ? 'une couleur' : 'une taille'}</option>
        {options.map((c) => (
          <option key={norm(c.value)} value={c.value} disabled={c.soldOut} className={c.soldOut ? 'text-red-500' : ''}>{label(c)}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="min-w-[10rem] space-y-2">
      {staleSaved && <p className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800">Cette variante n’est plus en vente : choisissez-en une autre.</p>}
      {historical && <p className="rounded-md bg-ink-100 px-2 py-1 text-[11px] font-bold text-ink-700">Commande d’origine : {historical} (à confirmer)</p>}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {axes.color && select('color', 'Couleur', colors)}
        {axes.size && select('size', 'Taille', sizes)}
      </div>
      {resolved && (
        <p className={`text-[11px] font-black ${resolved.available <= 0 ? 'text-red-600' : 'text-emerald-700'}`}>
          {[resolved.size, resolved.color].filter(Boolean).join(' / ')} — {availabilityLabel(resolved.available)}
        </p>
      )}
    </div>
  );
}
