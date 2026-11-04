'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import { useCart, selectCount } from '@/lib/cart';
import { formatPrice } from '@/lib/site-config';
import {
  Minus,
  Plus,
  Trash2,
  ShoppingBag,
  ShoppingCart,
  ChevronLeft,
  ArrowRight,
  RefreshCw,
  Truck,
  ShieldCheck,
  RotateCcw,
  FileText,
  Info,
  Tag,
  Lock,
  Check,
} from 'lucide-react';
import { useLanguage } from '@/components/site/LanguageProvider';

export default function PanierPage() {
  const router = useRouter();
  const items = useCart((s) => s.items);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const clear = useCart((s) => s.clear);
  const { t, lang, isRtl } = useLanguage();

  const [updated, setUpdated] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null);

  const count = useMemo(() => selectCount(items), [items]);
  const subtotal = useMemo(() => items.reduce((s, x) => s + x.price * x.qty, 0), [items]);
  const shipping = items.length > 0 ? 8 : 0;
  const discount = appliedCoupon?.discount ?? 0;
  const grand = Math.max(0, subtotal - discount + shipping);

  async function handleApplyCoupon(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const code = couponInput.trim();
    if (!code) return;

    setCouponLoading(true);
    setCouponError(null);

    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          items: items.map((i) => ({ productId: i.productId, price: i.price, qty: i.qty })),
        }),
      });

      const data = await res.json();
      if (data?.valid) {
        setAppliedCoupon({ code, discount: data.discount || 0 });
        setCouponError(null);
      } else {
        setCouponError(data?.reason || (lang === 'ar' ? 'رمز ترويجي غير صالح' : 'Code promo non valide'));
      }
    } catch {
      setCouponError(lang === 'ar' ? 'حدث خطأ أثناء التحقق' : 'Erreur lors de la validation du code');
    } finally {
      setCouponLoading(false);
    }
  }

  function handleRemoveCoupon() {
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponError(null);
  }

  return (
    <>
      <Header categories={[]} />

      <main className="container-shop py-6 sm:py-8 pb-32 lg:pb-16">
        {/* Breadcrumb Navigation */}
        <nav aria-label="Fil d'Ariane" className="mb-4 flex items-center gap-2 text-xs font-medium text-neutral-500">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-neutral-200/90 bg-white text-neutral-700 shadow-2xs hover:bg-neutral-50 active:scale-95 transition cursor-pointer lg:hidden"
            aria-label="Retour"
          >
            <ChevronLeft size={16} className={isRtl ? 'rotate-180' : ''} />
          </button>
          <Link href="/" className="hover:text-blue-600 transition">
            {lang === 'ar' ? 'الرئيسية' : 'Accueil'}
          </Link>
          <span className="text-neutral-300">›</span>
          <span className="font-semibold text-neutral-900">
            {lang === 'ar' ? 'سلة التسوق' : 'Mon Panier'}
          </span>
        </nav>

        {/* Title & Count Badge */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 shrink-0">
            <ShoppingCart size={22} className="stroke-[2.2]" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 tracking-tight">
            {lang === 'ar' ? 'سلة التسوق' : 'Mon Panier'}
          </h1>
          {items.length > 0 && (
            <span className="rounded-full bg-blue-100 text-blue-700 px-3 py-0.5 text-xs font-bold">
              {count} {lang === 'ar' ? 'منتجات' : count > 1 ? 'articles' : 'article'}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs sm:text-sm text-neutral-500">
          {lang === 'ar'
            ? 'تحقق من منتجاتك وقم بإتمام طلبك بسهولة.'
            : 'Vérifiez vos articles et finalisez votre commande.'}
        </p>

        {items.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-neutral-200/90 bg-white p-12 text-center shadow-2xs sm:p-16">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-blue-50 text-blue-600">
              <ShoppingBag size={32} />
            </div>
            <h2 className="text-xl font-bold text-neutral-900">{t.cart.empty}</h2>
            <p className="mt-2 text-sm text-neutral-500 max-w-sm mx-auto">
              {lang === 'ar'
                ? 'سلة التسوق فارغة حالياً. تصفح أحدث التشكيلات واختر ما يناسبك.'
                : 'Votre panier est actuellement vide. Découvrez notre nouvelle collection et trouvez votre bonheur.'}
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 active:scale-95"
            >
              <span>{t.cart.continueShopping}</span>
              <ArrowRight size={16} className={isRtl ? 'rotate-180' : ''} />
            </Link>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
            {/* Left Column: Cart Items Card + Trust Banner */}
            <div className="space-y-6 lg:col-span-7 xl:col-span-8">
              {/* Items Card */}
              <div className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-2xs">
                <div className="divide-y divide-neutral-100">
                  {items.map((i) => {
                    const variationEntries = i.variation
                      ? Object.entries(i.variation).filter(([, v]) => Boolean(v))
                      : [];

                    return (
                      <div
                        key={i.lineId}
                        className="flex items-center gap-3 p-4 sm:gap-4 sm:p-5 transition hover:bg-neutral-50/50"
                      >
                        {/* Thumbnail Image (Object Contain, rounded, subtle border) */}
                        <div className="relative h-16 w-16 sm:h-20 sm:w-20 rounded-xl border border-neutral-200/80 bg-neutral-50 p-1 shrink-0 flex items-center justify-center overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={i.image}
                            alt={i.name}
                            className="h-full w-full object-contain"
                            loading="lazy"
                          />
                        </div>

                        {/* Product Info */}
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-neutral-900 text-sm sm:text-base truncate">
                            {i.name}
                          </p>

                          {/* Mobile Variant summary: "Noir • L" */}
                          {variationEntries.length > 0 && (
                            <p className="mt-0.5 text-xs text-neutral-500 sm:hidden">
                              {variationEntries.map(([, v]) => v).join(' • ')}
                            </p>
                          )}

                          {/* Desktop Variant Chips */}
                          {variationEntries.length > 0 && (
                            <div className="mt-1.5 hidden sm:flex sm:flex-wrap sm:gap-1.5">
                              {variationEntries.map(([k, v]) => (
                                <span
                                  key={k}
                                  className="inline-flex items-center rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600"
                                >
                                  <span className="capitalize">{k}</span> : {v}
                                </span>
                              ))}
                            </div>
                          )}

                          {i.bundleSlot ? (
                            <span className="mt-1 inline-block rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                              Article {i.bundleSlot}
                            </span>
                          ) : null}
                        </div>

                        {/* Stepper + Price + Trash */}
                        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                          {/* Stepper */}
                          <div className="flex items-center rounded-xl border border-neutral-200/90 bg-white shadow-2xs">
                            <button
                              type="button"
                              onClick={() => setQty(i.lineId, i.qty - 1)}
                              className="grid h-8 w-7 sm:w-8 place-items-center text-neutral-500 hover:text-blue-600 transition cursor-pointer"
                              aria-label={t.product.decreaseQty}
                            >
                              <Minus size={13} />
                            </button>
                            <span className="w-7 sm:w-8 text-center text-xs sm:text-sm font-bold text-neutral-900">
                              {i.qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => setQty(i.lineId, i.qty + 1)}
                              className="grid h-8 w-7 sm:w-8 place-items-center text-neutral-500 hover:text-blue-600 transition cursor-pointer"
                              aria-label={t.product.increaseQty}
                            >
                              <Plus size={13} />
                            </button>
                          </div>

                          {/* Price */}
                          <span className="min-w-[55px] sm:min-w-[70px] text-end text-sm sm:text-base font-black text-neutral-900">
                            {formatPrice(i.price * i.qty)}
                          </span>

                          {/* Trash Icon */}
                          <button
                            type="button"
                            onClick={() => remove(i.lineId)}
                            className="rounded-xl p-1.5 sm:p-2 text-red-500 hover:text-red-700 hover:bg-red-50 transition cursor-pointer"
                            aria-label={t.cart.remove}
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Bottom Card Actions: Vider le panier & Mettre à jour */}
                <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50/40 px-4 py-3 sm:px-5 sm:py-3.5 text-xs sm:text-sm font-semibold">
                  <button
                    type="button"
                    onClick={() => clear()}
                    className="flex items-center gap-1.5 text-neutral-500 hover:text-red-600 transition cursor-pointer"
                  >
                    <Trash2 size={15} />
                    <span>{lang === 'ar' ? 'إفراغ السلة' : 'Vider le panier'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUpdated(true);
                      setTimeout(() => setUpdated(false), 1200);
                    }}
                    className="flex items-center gap-1.5 text-neutral-700 hover:text-blue-600 transition cursor-pointer"
                  >
                    <RefreshCw size={14} className={updated ? 'animate-spin text-blue-600' : ''} />
                    <span>
                      {updated
                        ? lang === 'ar'
                          ? 'تم التحديث!'
                          : 'Mis à jour !'
                        : lang === 'ar'
                        ? 'تحديث'
                        : 'Mettre à jour'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Trust Strip (Livraison rapide, Paiement à la livraison, Échange & retour) */}
              <div className="rounded-2xl border border-blue-100/90 bg-[#F0F7FF] p-4 sm:p-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                      <Truck size={18} />
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm font-bold text-neutral-900">
                        {lang === 'ar' ? 'توصيل سريع' : 'Livraison rapide'}
                      </p>
                      <p className="text-[11px] text-neutral-500">
                        {lang === 'ar' ? 'كامل تراب الجمهورية (24-48 ساعة)' : 'Partout en Tunisie (24h – 48h)'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                      <ShieldCheck size={18} />
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm font-bold text-neutral-900">
                        {lang === 'ar' ? 'الدفع عند الاستلام' : 'Paiement à la livraison'}
                      </p>
                      <p className="text-[11px] text-neutral-500">
                        {lang === 'ar' ? 'بدون أي التزام مسبق' : 'Sans engagement'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                      <RotateCcw size={18} />
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm font-bold text-neutral-900">
                        {lang === 'ar' ? 'استبدال واسترجاع' : 'Échange & retour'}
                      </p>
                      <p className="text-[11px] text-neutral-500">
                        {lang === 'ar' ? 'خلال 7 أيام' : 'Sous 7 jours'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column (Desktop) & Below Items (Mobile) */}
            <div className="space-y-4 lg:col-span-5 xl:col-span-4 lg:sticky lg:top-24">
              {/* Code Promo Card (Mobile Order: shown before summary card on mobile; inside or above summary on desktop) */}
              <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-2xs lg:hidden">
                <div className="flex items-center gap-2 mb-3">
                  <Tag size={18} className="text-blue-600" />
                  <h2 className="text-sm font-bold text-neutral-900">
                    {lang === 'ar' ? 'رمز ترويجي' : 'Code promo'}
                  </h2>
                </div>
                {appliedCoupon ? (
                  <div className="flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs text-emerald-800">
                    <span className="flex items-center gap-1.5 font-bold">
                      <Check size={14} /> {appliedCoupon.code} (-{formatPrice(appliedCoupon.discount)})
                    </span>
                    <button
                      type="button"
                      onClick={handleRemoveCoupon}
                      className="text-emerald-700 hover:text-red-600 font-semibold underline text-[11px]"
                    >
                      {t.checkout.couponRemove}
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleApplyCoupon} className="flex gap-2">
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value)}
                      placeholder={lang === 'ar' ? 'أدخل الرمز الترويجي' : 'Entrez votre code'}
                      className="w-full rounded-xl border border-neutral-200/90 px-3.5 py-2.5 text-xs sm:text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 transition"
                    />
                    <button
                      type="submit"
                      disabled={couponLoading || !couponInput.trim()}
                      className="shrink-0 rounded-xl bg-blue-600 px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-2xs hover:bg-blue-700 active:scale-95 transition disabled:opacity-50"
                    >
                      {couponLoading ? '...' : lang === 'ar' ? 'تطبيق' : 'Appliquer'}
                    </button>
                  </form>
                )}
                {couponError && <p className="mt-2 text-xs text-red-600 font-medium">{couponError}</p>}
              </div>

              {/* Summary Card */}
              <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 sm:p-6 shadow-2xs">
                {/* Header */}
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-neutral-100">
                  <FileText size={20} className="text-blue-600" />
                  <h2 className="text-base sm:text-lg font-bold text-neutral-900">
                    {lang === 'ar' ? 'ملخص الطلب' : 'Récapitulatif'}
                  </h2>
                </div>

                {/* Calculation Rows */}
                <div className="space-y-3 text-xs sm:text-sm">
                  <div className="flex justify-between text-neutral-600">
                    <span>
                      {lang === 'ar'
                        ? `المجموع الفرعي (${count} منتجات)`
                        : `Sous-total (${count} ${count > 1 ? 'articles' : 'article'})`}
                    </span>
                    <span className="font-bold text-neutral-900">{formatPrice(subtotal)}</span>
                  </div>

                  <div className="flex justify-between text-neutral-600">
                    <span className="flex items-center gap-1">
                      <span>{t.cart.shipping}</span>
                      <Info size={13} className="text-neutral-400" />
                    </span>
                    <span className="font-bold text-neutral-900">{formatPrice(shipping)}</span>
                  </div>

                  {discount > 0 && (
                    <div className="flex justify-between text-emerald-600 font-semibold">
                      <span>{t.checkout.discount}</span>
                      <span>-{formatPrice(discount)}</span>
                    </div>
                  )}

                  {/* Light Blue Total Highlight Banner */}
                  <div className="mt-4 rounded-xl border border-blue-100/90 bg-[#EFF6FF] p-3.5 sm:p-4 flex items-center justify-between">
                    <span className="text-sm sm:text-base font-bold text-neutral-900">
                      {lang === 'ar' ? 'المجموع للدفع' : 'Total à payer'}
                    </span>
                    <span className="text-xl sm:text-2xl font-black text-blue-600">
                      {formatPrice(grand)}
                    </span>
                  </div>
                </div>

                {/* Code Promo Card inside Desktop Summary */}
                <div className="hidden lg:block mt-5 pt-4 border-t border-neutral-100">
                  <div className="flex items-center gap-2 mb-2.5">
                    <Tag size={16} className="text-blue-600" />
                    <span className="text-xs font-bold text-neutral-900">
                      {lang === 'ar' ? 'رمز ترويجي' : 'Code promo'}
                    </span>
                  </div>
                  {appliedCoupon ? (
                    <div className="flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">
                      <span className="flex items-center gap-1.5 font-bold">
                        <Check size={14} /> {appliedCoupon.code} (-{formatPrice(appliedCoupon.discount)})
                      </span>
                      <button
                        type="button"
                        onClick={handleRemoveCoupon}
                        className="text-emerald-700 hover:text-red-600 font-semibold underline text-[11px]"
                      >
                        {t.checkout.couponRemove}
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleApplyCoupon} className="flex gap-2">
                      <input
                        type="text"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value)}
                        placeholder={lang === 'ar' ? 'أدخل الرمز الترويجي' : 'Entrez votre code'}
                        className="w-full rounded-xl border border-neutral-200/90 px-3 py-2 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 transition"
                      />
                      <button
                        type="submit"
                        disabled={couponLoading || !couponInput.trim()}
                        className="shrink-0 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 active:scale-95 transition disabled:opacity-50"
                      >
                        {couponLoading ? '...' : lang === 'ar' ? 'تطبيق' : 'Appliquer'}
                      </button>
                    </form>
                  )}
                  {couponError && <p className="mt-1.5 text-xs text-red-600 font-medium">{couponError}</p>}
                </div>

                {/* Desktop Checkout CTA Button */}
                <div className="hidden lg:block mt-5">
                  <Link
                    href="/commande"
                    className="w-full rounded-2xl bg-blue-600 px-6 py-3.5 text-center text-sm sm:text-base font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    <Lock size={16} />
                    <span>{lang === 'ar' ? 'إتمام الطلب' : 'Passer la commande'}</span>
                    <ArrowRight size={16} className={isRtl ? 'rotate-180' : ''} />
                  </Link>
                  <p className="mt-3 flex items-center justify-center gap-1.5 text-xs font-medium text-neutral-500">
                    <Lock size={13} className="text-neutral-400" />
                    <span>
                      {lang === 'ar' ? 'طلب آمن ومضمون 100%' : 'Commande 100% sécurisée'}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pinned Fixed Bottom Checkout Bar on Mobile Viewports */}
        {items.length > 0 && (
          <aside
            aria-label="Finaliser la commande"
            className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200/90 bg-white/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] backdrop-blur-md shadow-[0_-4px_25px_rgba(0,0,0,0.1)] lg:hidden"
          >
            <div className="mx-auto flex max-w-lg items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  {lang === 'ar' ? 'المجموع' : 'Total'}
                </p>
                <p className="text-xl font-black text-blue-600">{formatPrice(grand)}</p>
              </div>
              <Link
                href="/commande"
                className="flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition active:scale-95 hover:bg-blue-700"
              >
                <Lock size={15} />
                <span>{lang === 'ar' ? 'إتمام الطلب' : 'Passer la commande'}</span>
                <ArrowRight size={15} className={isRtl ? 'rotate-180' : ''} />
              </Link>
            </div>
          </aside>
        )}
      </main>

      <Footer />
    </>
  );
}
