'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Minus, Plus, ShoppingBag, Check, XCircle, ArrowRight } from 'lucide-react';
import { useCart } from '@/lib/cart';
import { getPrimaryProductImage, type Product } from '@/types';
import VariantSelector from './VariantSelector';
import { SITE, formatPrice } from '@/lib/site-config';
import { useLanguage } from '@/components/site/LanguageProvider';

export default function AddToCart({ product }: { product: Product }) {
  const router = useRouter();
  const add = useCart((s) => s.add);
  const { t } = useLanguage();
  const mainCtaRef = useRef<HTMLButtonElement>(null);
  const [showStickyMobile, setShowStickyMobile] = useState(false);

  useEffect(() => {
    const el = mainCtaRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowStickyMobile(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const soldOut = !product.inStock;
  const matrix = product.inventoryModel === 'MATRIX';
  const [variantId, setVariantId] = useState('');
  const [bundleVariants, setBundleVariants] = useState<string[]>([]);
  const selectedVariant = product.variants?.find((v) => v.id === variantId);
  const snapshot = (id: string) => {
    const v = product.variants?.find((item) => item.id === id);
    return v ? { Taille: v.size, Couleur: v.color } : undefined;
  };

  const variantAttrs = (matrix ? [] : product.attributes).filter((a) => a.options.length);

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

  const effectivePrice = selectedBundle ? selectedBundle.price : selectedVariant?.price ?? product.price;
  const cartUnitPrice = effectivePrice / Math.max(1, bundleQty);
  const cartQty = bundleQty * extra;

  const chosenIds = bundleActive ? Array.from({ length: bundleQty }, (_, i) => bundleVariants[i]) : [variantId];
  const validSelection = !matrix || chosenIds.every((id) => {
    const v = product.variants?.find((variant) => variant.id === id && variant.active);
    const needed = chosenIds.filter((other) => other === id).length * extra;
    return v && (product.inventoryEnabled === false || v.available >= needed);
  });

  const doAdd = (buyNow = false) => {
    if (soldOut || !validSelection) return;
    if (bundleActive) {
      for (let mul = 0; mul < extra; mul++) {
        for (let slot = 0; slot < bundleQty; slot++) {
          add({
            productId: product.id,
            variantId: matrix ? bundleVariants[slot] : product.variants?.find((v) => v.active)?.id,
            name: selectedBundle ? `${product.name} — ${selectedBundle.name}` : product.name,
            price: cartUnitPrice,
            qty: 1,
            image: getPrimaryProductImage(product.images)?.url ?? '',
            variation: matrix ? snapshot(bundleVariants[slot]) : bundleItems[slot] && Object.keys(bundleItems[slot]).length ? bundleItems[slot] : undefined,
            bundleId,
            bundleName: selectedBundle?.name,
            bundleSlot: slot + 1,
          });
        }
      }
    } else {
      add({
        productId: product.id,
        variantId: matrix ? variantId : product.variants?.find((v) => v.active)?.id,
        name: product.name,
        price: cartUnitPrice,
        qty: cartQty,
        image: getPrimaryProductImage(product.images)?.url ?? '',
        variation: matrix ? snapshot(variantId) : variantAttrs.length ? picked : undefined,
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
    return 'bg-neutral-900';
  }

  return (
    <div className="mt-5 space-y-5">
      {soldOut && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 shadow-2xs">
          <XCircle size={18} className="text-red-600 shrink-0" />
          <span>{t.product.outOfStock}</span>
        </div>
      )}

      {/* Bundle Offers Selector */}
      {product.bundles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-700">{t.product.offers}</span>
            {selectedBundle && (
              <span className="text-xs font-bold text-neutral-900">Sélectionné</span>
            )}
          </div>
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
                  className={`flex items-center justify-between rounded-xl border p-3.5 text-start transition-all duration-150 cursor-pointer ${
                    active
                      ? 'border-neutral-950 bg-neutral-950 text-white shadow-xs'
                      : 'border-neutral-200/90 bg-[#FBFBFB] hover:bg-neutral-100/80 text-neutral-900'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        active
                          ? 'border-white bg-white text-neutral-950'
                          : 'border-neutral-400 bg-transparent'
                      }`}
                    >
                      {active && <Check size={12} strokeWidth={3} />}
                    </span>
                    <div>
                      <p className={`font-extrabold text-sm sm:text-base leading-tight ${active ? 'text-white' : 'text-neutral-900'}`}>
                        {b.name}
                      </p>
                      {b.label && <p className={`text-xs mt-0.5 font-medium ${active ? 'text-neutral-300' : 'text-neutral-500'}`}>{b.label}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-end">
                    {discount > 0 && (
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ${active ? 'bg-white text-neutral-950' : 'bg-red-600 text-white'}`}>
                        -{discount}%
                      </span>
                    )}
                    <div>
                      <p className={`text-base font-black ${active ? 'text-white' : 'text-neutral-950'}`}>{formatPrice(b.price)}</p>
                      {b.regularPrice > b.price && (
                        <p className={`text-xs line-through font-medium ${active ? 'text-neutral-400' : 'text-neutral-400'}`}>
                          {formatPrice(b.regularPrice)}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Non-matrix Bundle Items Slot Selector */}
      {bundleActive && variantAttrs.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 bg-[#F8F9FA] p-4 shadow-2xs">
          <div className="mb-3 flex items-start justify-between gap-3 border-b border-neutral-200/80 pb-2.5">
            <div>
              <p className="text-sm font-bold text-neutral-900">{selectedBundle?.name}</p>
              {selectedBundle?.label && <p className="text-xs text-neutral-500">{selectedBundle.label}</p>}
            </div>
            <p className="text-base font-black text-neutral-950">{formatPrice(selectedBundle?.price ?? 0)}</p>
          </div>

          <div
            className="grid items-center gap-x-2 sm:gap-x-3 gap-y-2"
            style={{ gridTemplateColumns: `50px repeat(${variantAttrs.length}, minmax(0, 1fr))` }}
          >
            <span />
            {variantAttrs.map((a) => (
              <span key={a.name} className="text-xs font-bold text-neutral-700">{a.name}</span>
            ))}

            {Array.from({ length: bundleQty }).map((_, i) => (
              <Slot
                key={i}
                index={i}
                attrs={variantAttrs}
                value={bundleItems[i] ?? {}}
                itemLabel={t.product.item}
                onChange={(n, v) => updateBundleItem(i, n, v)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Matrix Variants Selector */}
      {matrix && (
        bundleActive ? (
          <div className="space-y-3">
            {Array.from({ length: bundleQty }, (_, i) => (
              <div key={i} className="rounded-2xl border border-neutral-200 bg-[#FAFAFA] p-4 shadow-2xs">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-neutral-700">Article {i + 1}</p>
                <VariantSelector
                  variants={product.variants ?? []}
                  stockEnabled={product.inventoryEnabled !== false}
                  value={bundleVariants[i]}
                  onChange={(id) =>
                    setBundleVariants((prev) => {
                      const next = [...prev];
                      next[i] = id;
                      return next;
                    })
                  }
                />
              </div>
            ))}
          </div>
        ) : (
          <VariantSelector
            variants={product.variants ?? []}
            stockEnabled={product.inventoryEnabled !== false}
            value={variantId}
            onChange={setVariantId}
          />
        )
      )}

      {matrix && !validSelection && (
        <p className="text-xs font-semibold text-neutral-600 bg-neutral-100 border border-neutral-200 rounded-xl px-3 py-2">
          Veuillez sélectionner une taille et une couleur disponibles.
        </p>
      )}

      {/* Single Product Attributes (non-matrix) */}
      {!bundleActive && variantAttrs.map((a) => (
        <div key={a.name} className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-700">{a.name}</p>
          <div className="flex flex-wrap gap-2">
            {a.options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setPicked({ ...picked, [a.name]: opt })}
                className={`h-10 min-w-[3rem] px-3.5 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer ${
                  picked[a.name] === opt
                    ? 'bg-neutral-950 text-white font-black shadow-sm'
                    : 'bg-[#F4F4F4] text-neutral-800 border border-neutral-200/60 hover:bg-neutral-200/70'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Quantity & Actions Bar */}
      <div className="pt-2 space-y-3">
        <div className="flex items-center gap-3">
          {/* Quantity Selector */}
          <div className="flex h-12 items-center rounded-xl border border-neutral-200 bg-[#F7F7F7] shadow-2xs">
            <button
              type="button"
              disabled={soldOut}
              onClick={() => setExtra(Math.max(1, extra - 1))}
              className="grid h-12 w-11 place-items-center text-neutral-700 hover:bg-neutral-200/60 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 transition cursor-pointer"
              aria-label={t.product.decreaseQty}
            >
              <Minus size={16} />
            </button>
            <span className="w-10 text-center font-bold text-neutral-900 text-sm select-none">{extra}</span>
            <button
              type="button"
              disabled={soldOut}
              onClick={() => setExtra(extra + 1)}
              className="grid h-12 w-11 place-items-center text-neutral-700 hover:bg-neutral-200/60 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 transition cursor-pointer"
              aria-label={t.product.increaseQty}
            >
              <Plus size={16} />
            </button>
          </div>

          {/* Secondary CTA: Ajouter au panier */}
          <button
            type="button"
            disabled={soldOut || !validSelection}
            onClick={() => doAdd(false)}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white font-extrabold text-sm sm:text-base text-neutral-800 hover:border-neutral-950 hover:bg-neutral-50 active:scale-[0.99] transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ShoppingBag size={18} />
            <span>{t.product.addToCart}</span>
          </button>
        </div>

        {/* Primary CTA: Acheter maintenant (High Fashion Solid Black) */}
        <button
          type="button"
          ref={mainCtaRef}
          disabled={soldOut || !validSelection}
          onClick={() => doAdd(true)}
          className="flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-neutral-950 hover:bg-black text-white font-black text-base shadow-md active:scale-[0.99] transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          <span>{t.common.buyNow}</span>
          <ArrowRight size={18} />
        </button>
      </div>

      {/* Sticky Mobile Purchase Action — Exactly Matching Mockup Bottom Bar */}
      {showStickyMobile && !soldOut && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md px-5 py-3.5 border-t border-neutral-200/80 shadow-2xl flex items-center justify-between gap-4 md:hidden">
          <div className="flex flex-col min-w-0 pr-2">
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Sous-total</span>
            <span className="text-xl font-black text-neutral-950 leading-tight">{formatPrice(effectivePrice)}</span>
          </div>
          <button
            type="button"
            disabled={!validSelection}
            onClick={() => {
              if (!validSelection && mainCtaRef.current) {
                window.scrollTo({ top: mainCtaRef.current.offsetTop - 150, behavior: 'smooth' });
              } else {
                doAdd(true);
              }
            }}
            className="h-12 px-7 rounded-xl bg-neutral-950 hover:bg-black text-white text-sm font-black shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
          >
            <span>{t.common.buyNow}</span>
            <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function Slot({
  index,
  attrs,
  value,
  itemLabel,
  onChange,
}: {
  index: number;
  attrs: { name: string; options: string[] }[];
  value: Record<string, string>;
  itemLabel: string;
  onChange: (attrName: string, value: string) => void;
}) {
  return (
    <>
      <span className="text-xs font-bold text-neutral-700">{itemLabel} {index + 1}</span>
      {attrs.map((a) => (
        <select
          key={a.name}
          value={value[a.name] ?? ''}
          onChange={(e) => onChange(a.name, e.target.value)}
          className="h-10 min-w-0 rounded-xl border border-neutral-300 bg-white px-2.5 text-xs sm:text-sm font-bold text-neutral-800 outline-none focus:border-neutral-950 focus:ring-1 focus:ring-neutral-950 transition"
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
