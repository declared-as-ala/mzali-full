'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Minus,
  Plus,
  ShoppingBag,
  Check,
  XCircle,
  AlertCircle,
  Tag,
  Package,
  Zap,
  Truck,
  CreditCard,
  RotateCcw,
} from 'lucide-react';
import { useCart } from '@/lib/cart';
import { getPrimaryProductImage, type Product } from '@/types';
import VariantSelector from './VariantSelector';
import { formatPrice } from '@/lib/site-config';
import { useLanguage } from '@/components/site/LanguageProvider';

export default function AddToCart({ product }: { product: Product }) {
  const router = useRouter();
  const add = useCart((s) => s.add);
  const { t } = useLanguage();
  const variantSectionRef = useRef<HTMLDivElement>(null);
  const [showPromptWarning, setShowPromptWarning] = useState(false);

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

  const handleAction = (buyNow: boolean) => {
    if (soldOut) return;
    if (!validSelection) {
      setShowPromptWarning(true);
      if (variantSectionRef.current) {
        variantSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
    doAdd(buyNow);
  };

  function updateBundleItem(idx: number, attrName: string, value: string) {
    setBundleItems((prev) => {
      const next = prev.slice();
      next[idx] = { ...(next[idx] ?? {}), [attrName]: value };
      return next;
    });
  }

  return (
    <div className="mt-5 space-y-5">
      {soldOut && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 shadow-2xs">
          <XCircle size={18} className="text-red-600 shrink-0" />
          <span>{t.product.outOfStock}</span>
        </div>
      )}

      {/* Bundle Offers Selector (Matching Photo 2) */}
      {product.bundles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-neutral-900">
            <span className="flex items-center gap-1.5 font-extrabold">
              <Tag size={15} className="text-blue-600" />
              <span>{t.product.offers}</span>
            </span>
            {selectedBundle && (
              <span className="text-xs font-bold text-blue-600">Sélectionné</span>
            )}
          </div>
          <div className="grid gap-2">
            {product.bundles.map((b) => {
              const active = b.id === bundleId;
              const savings = b.regularPrice > b.price ? b.regularPrice - b.price : 0;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBundleId(b.id)}
                  className={`flex items-center justify-between rounded-xl p-3 sm:p-3.5 text-start transition-all duration-150 cursor-pointer ${
                    active
                      ? 'border-2 border-blue-600 bg-blue-50/50 text-neutral-900 shadow-2xs'
                      : 'border border-neutral-200/90 bg-white hover:bg-neutral-50 text-neutral-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors ${
                        active
                          ? 'bg-blue-600 text-white'
                          : 'border-2 border-neutral-300 bg-transparent'
                      }`}
                    >
                      {active && <Check size={12} strokeWidth={3} />}
                    </span>
                    <div>
                      <p className="font-extrabold text-sm sm:text-base leading-tight text-neutral-900">
                        {b.name}
                      </p>
                      {b.label && <p className="text-xs mt-0.5 font-medium text-neutral-500">{b.label}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-end">
                    {savings > 0 && (
                      <span className="rounded-md px-2 py-0.5 text-xs font-bold bg-blue-100 text-blue-700">
                        Économisez {formatPrice(savings)}
                      </span>
                    )}
                    <div>
                      <p className="text-base font-black text-neutral-900">{formatPrice(b.price)}</p>
                      {b.regularPrice > b.price && (
                        <p className="text-xs line-through font-medium text-neutral-400">
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
      <div ref={variantSectionRef} className="space-y-3">
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
                    onChange={(id) => {
                      setShowPromptWarning(false);
                      setBundleVariants((prev) => {
                        const next = [...prev];
                        next[i] = id;
                        return next;
                      });
                    }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <VariantSelector
              variants={product.variants ?? []}
              stockEnabled={product.inventoryEnabled !== false}
              value={variantId}
              onChange={(id) => {
                setShowPromptWarning(false);
                setVariantId(id);
              }}
            />
          )
        )}

        {matrix && !validSelection && (
          <div className="flex items-center gap-2 rounded-xl bg-amber-50/90 border border-amber-200 px-3.5 py-2.5 text-xs font-semibold text-amber-900">
            <AlertCircle size={16} className="text-amber-700 shrink-0" />
            <span>Veuillez sélectionner une taille et une couleur disponibles.</span>
          </div>
        )}
      </div>

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
                    ? 'bg-blue-600 text-white font-black shadow-sm ring-2 ring-blue-100'
                    : 'bg-white hover:bg-neutral-50 text-neutral-800 border border-neutral-200/90 shadow-2xs'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Quantity & Actions (Matching Photo 2) */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-neutral-900">
          <Package size={15} className="text-blue-600" />
          <span>Quantité</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Quantity Stepper */}
          <div className="flex h-12 items-center rounded-xl border border-neutral-200 bg-white shadow-2xs">
            <button
              type="button"
              disabled={soldOut}
              onClick={() => setExtra(Math.max(1, extra - 1))}
              className="grid h-12 w-11 place-items-center text-neutral-700 hover:bg-neutral-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 transition cursor-pointer"
              aria-label={t.product.decreaseQty}
            >
              <Minus size={16} />
            </button>
            <span className="w-10 text-center font-bold text-neutral-900 text-sm select-none">{extra}</span>
            <button
              type="button"
              disabled={soldOut}
              onClick={() => setExtra(extra + 1)}
              className="grid h-12 w-11 place-items-center text-neutral-700 hover:bg-neutral-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 transition cursor-pointer"
              aria-label={t.product.increaseQty}
            >
              <Plus size={16} />
            </button>
          </div>

          {/* Desktop Secondary CTA: Ajouter au panier (Photo 2) */}
          <button
            type="button"
            disabled={soldOut}
            onClick={() => handleAction(false)}
            className="hidden md:flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-blue-600 bg-white font-extrabold text-sm sm:text-base text-blue-600 hover:bg-blue-50 active:scale-[0.99] transition-all cursor-pointer disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-400 disabled:bg-neutral-50 shadow-2xs"
          >
            <ShoppingBag size={18} />
            <span>{t.product.addToCart}</span>
          </button>

          {/* Desktop Primary CTA: Acheter maintenant (Photo 2) */}
          <button
            type="button"
            disabled={soldOut}
            onClick={() => handleAction(true)}
            className="hidden md:flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm sm:text-base shadow-md shadow-blue-600/20 active:scale-[0.99] transition-all cursor-pointer disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400 disabled:shadow-none"
          >
            <Zap size={18} fill="currentColor" />
            <span>{t.common.buyNow}</span>
          </button>
        </div>
      </div>

      {/* REAL FIXED BOTTOM PURCHASE BAR (Mobile Viewport) */}
      <div className="fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-md border-t border-neutral-200/90 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] px-3.5 sm:px-4 py-2.5 pb-[calc(0.65rem+env(safe-area-inset-bottom,0px))] md:hidden transition-all">
        {soldOut ? (
          <div className="w-full h-12 rounded-xl bg-neutral-100 border border-neutral-200 text-neutral-400 font-bold text-sm flex items-center justify-center cursor-not-allowed select-none">
            {t.product.outOfStock}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {(!validSelection || showPromptWarning) && (
              <div className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-900 border border-amber-200/80 animate-in fade-in duration-200">
                <span className="truncate">Veuillez sélectionner votre taille / couleur</span>
                <button
                  type="button"
                  onClick={() => variantSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                  className="shrink-0 underline text-amber-950 font-extrabold cursor-pointer"
                >
                  Choisir
                </button>
              </div>
            )}
            <div className="flex items-center gap-2.5">
              {/* Outlined Button: Ajouter au panier */}
              <button
                type="button"
                onClick={() => handleAction(false)}
                className={`flex-1 h-12 rounded-xl border-2 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer ${
                  !validSelection
                    ? 'border-neutral-300 bg-white text-neutral-500'
                    : 'border-blue-600 bg-white text-blue-600 hover:bg-blue-50 shadow-2xs'
                }`}
              >
                <ShoppingBag size={17} />
                <span>{t.product.addToCart}</span>
              </button>

              {/* Solid Royal Blue Button: Acheter maintenant */}
              <button
                type="button"
                onClick={() => handleAction(true)}
                className={`flex-1 h-12 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer ${
                  !validSelection
                    ? 'bg-neutral-800 text-white/90'
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20'
                }`}
              >
                <Zap size={16} fill="currentColor" />
                <span>{t.common.buyNow}</span>
              </button>
            </div>
          </div>
        )}
      </div>
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
          className="h-10 min-w-0 rounded-xl border border-neutral-300 bg-white px-2.5 text-xs sm:text-sm font-bold text-neutral-800 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition"
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
