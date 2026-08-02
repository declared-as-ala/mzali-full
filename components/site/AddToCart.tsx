'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Minus, Plus, ShoppingBag, Zap, Check } from 'lucide-react';
import { useCart } from '@/lib/cart';
import type { Product } from '@/types';
import { SITE } from '@/lib/site-config';
import { useLanguage } from '@/components/site/LanguageProvider';

export default function AddToCart({ product }: { product: Product }) {
  const router = useRouter();
  const add = useCart((s) => s.add);
  const { t } = useLanguage();

  // This catalog tracks stock per product, not per size/color combination
  // (a product's options are customer-facing preference text, not
  // independent SKUs) — so "sold out" is whole-product, not per-option.
  const soldOut = !product.inStock;

  const variantAttrs = product.attributes.filter((a) => a.options.length);

  const [bundleId, setBundleId] = useState<string | undefined>(
    product.bundles.find((b) => b.isDefault)?.id ?? product.bundles[0]?.id,
  );
  const selectedBundle = useMemo(
    () => product.bundles.find((b) => b.id === bundleId),
    [product.bundles, bundleId],
  );
  const bundleQty = selectedBundle?.quantity ?? 1;
  const bundleActive = !!selectedBundle && bundleQty > 1;

  const [picked, setPicked] = useState<Record<string, string>>({});
  const [bundleItems, setBundleItems] = useState<Record<string, string>[]>([]);

  useEffect(() => {
    if (!bundleActive) {
      setBundleItems([]);
      return;
    }
    setBundleItems((prev) => {
      const next = Array.from({ length: bundleQty }, (_, i) => prev[i] ?? {});
      return next;
    });
  }, [bundleQty, bundleActive]);

  const [extra, setExtra] = useState(1);

  const effectivePrice = selectedBundle ? selectedBundle.price : product.price;
  const cartUnitPrice = effectivePrice / Math.max(1, bundleQty);
  const cartQty = bundleQty * extra;

  const doAdd = (buyNow = false) => {
    if (soldOut) return;
    if (bundleActive) {
      for (let mul = 0; mul < extra; mul++) {
        for (let slot = 0; slot < bundleQty; slot++) {
          add({
            productId: product.id,
            name: selectedBundle ? `${product.name} — ${selectedBundle.name}` : product.name,
            price: cartUnitPrice,
            qty: 1,
            image: product.images[0]?.url ?? '',
            variation: bundleItems[slot] && Object.keys(bundleItems[slot]).length ? bundleItems[slot] : undefined,
            bundleId,
            bundleName: selectedBundle?.name,
            bundleSlot: slot + 1,
          });
        }
      }
    } else {
      add({
        productId: product.id,
        name: product.name,
        price: cartUnitPrice,
        qty: cartQty,
        image: product.images[0]?.url ?? '',
        variation: variantAttrs.length ? picked : undefined,
      });
    }
    if (buyNow) {
      router.push('/commande');
    } else {
      router.push('/');
    }
  };

  function updateBundleItem(idx: number, attrName: string, value: string) {
    setBundleItems((prev) => {
      const next = prev.slice();
      next[idx] = { ...(next[idx] ?? {}), [attrName]: value };
      return next;
    });
  }

  function badgeColorClasses(c: 'red' | 'green' | 'blue' | 'purple'): string {
    if (c === 'red') return 'bg-red-500';
    if (c === 'green') return 'bg-emerald-500';
    if (c === 'blue') return 'bg-blue-500';
    return 'bg-brand-500';
  }

  return (
    <div className="mt-6 space-y-4">
      {soldOut && (
        <p className="inline-flex items-center rounded-lg bg-ink-900/85 px-3 py-1.5 text-sm font-bold text-white">
          {t.product.outOfStock}
        </p>
      )}

      {product.bundles.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-bold text-ink-700">{t.product.offers}</p>
          <div className="grid gap-2">
            {product.bundles.map((b) => {
              const active = b.id === bundleId;
              const discount = b.regularPrice > b.price
                ? Math.round(((b.regularPrice - b.price) / b.regularPrice) * 100)
                : 0;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBundleId(b.id)}
                  className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 text-start transition ${
                    active ? 'border-brand-500 bg-brand-50' : 'border-ink-200 bg-white hover:border-brand-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {active && (
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-500 text-white">
                        <Check size={14} />
                      </span>
                    )}
                    <div>
                      <p className="font-black text-ink-900">{b.name}</p>
                      {b.label && <p className="text-xs text-ink-700">{b.label}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-end">
                    {discount > 0 && (
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-black text-white ${badgeColorClasses(b.badgeColor)}`}>
                        -{discount}%
                      </span>
                    )}
                    <div>
                      <p className="text-lg font-black text-brand-500">{b.price} {SITE.currency.symbol}</p>
                      {b.regularPrice > b.price && (
                        <p className="text-xs text-ink-300 line-through">{b.regularPrice} {SITE.currency.symbol}</p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {bundleActive && variantAttrs.length > 0 && (
        <div className="rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 p-5 text-white shadow-soft">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-black leading-tight">{selectedBundle?.name}</p>
              {selectedBundle?.label && <p className="text-xs opacity-90">{selectedBundle.label}</p>}
            </div>
            <p className="text-xl font-black">{selectedBundle?.price} {SITE.currency.symbol}</p>
          </div>

          <div
            className="grid items-center gap-x-3 gap-y-2"
            style={{ gridTemplateColumns: `60px repeat(${variantAttrs.length}, minmax(0, 1fr))` }}
          >
            <span />
            {variantAttrs.map((a) => (
              <span key={a.name} className="text-xs font-bold opacity-90">{a.name}</span>
            ))}

            {Array.from({ length: bundleQty }).map((_, i) => (
              <Slot key={i} index={i} attrs={variantAttrs} value={bundleItems[i] ?? {}} itemLabel={t.product.item} onChange={(n, v) => updateBundleItem(i, n, v)} />
            ))}
          </div>
        </div>
      )}

      {!bundleActive && variantAttrs.map((a) => (
        <div key={a.name}>
          <p className="mb-2 text-sm font-bold text-ink-700">{a.name}</p>
          <div className="flex flex-wrap gap-2">
            {a.options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setPicked({ ...picked, [a.name]: opt })}
                className={`rounded-lg border px-4 py-2 text-sm font-bold transition ${
                  picked[a.name] === opt ? 'border-brand-500 bg-brand-50 text-brand-500' : 'border-ink-200 hover:border-brand-300'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <div className="flex items-center rounded-xl border border-ink-200">
          <button disabled={soldOut} onClick={() => setExtra(Math.max(1, extra - 1))} className="grid h-12 w-12 place-items-center text-ink-700 hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-40" aria-label={t.product.decreaseQty}><Minus size={16} /></button>
          <span className="w-12 text-center font-bold">{extra}</span>
          <button disabled={soldOut} onClick={() => setExtra(extra + 1)} className="grid h-12 w-12 place-items-center text-ink-700 hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-40" aria-label={t.product.increaseQty}><Plus size={16} /></button>
        </div>
        <button disabled={soldOut} onClick={() => doAdd(false)} className="btn-ghost flex-1 disabled:cursor-not-allowed disabled:opacity-40">
          <ShoppingBag size={18} /> {t.product.addToCart}
        </button>
      </div>
      <button disabled={soldOut} onClick={() => doAdd(true)} className="btn-cta w-full shake-cta disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none">
        <Zap size={18} /> {t.common.buyNow}
      </button>
    </div>
  );
}

function Slot({
  index, attrs, value, itemLabel, onChange,
}: {
  index: number;
  attrs: { name: string; options: string[] }[];
  value: Record<string, string>;
  itemLabel: string;
  onChange: (attrName: string, value: string) => void;
}) {
  return (
    <>
      <span className="text-sm font-bold opacity-90">{itemLabel} {index + 1}</span>
      {attrs.map((a) => (
        <select
          key={a.name}
          value={value[a.name] ?? ''}
          onChange={(e) => onChange(a.name, e.target.value)}
          className="h-10 min-w-0 rounded-lg border border-white/40 bg-white px-2 text-sm font-bold text-ink-900 outline-none focus:border-brand-300 focus:ring-2 focus:ring-white/30"
        >
          <option value="">-</option>
          {a.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ))}
    </>
  );
}
