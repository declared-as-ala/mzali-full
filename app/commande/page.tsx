'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ShieldCheck, Truck, ShoppingBag, ArrowRight, Loader2, Tag, CheckCircle2, AlertCircle } from 'lucide-react';
import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import { useCart } from '@/lib/cart';
import { SITE, formatPrice } from '@/lib/site-config';
import { useLanguage } from '@/components/site/LanguageProvider';
import { isValidPhone, normalizePhone } from '@/lib/phone';

const COUPONS_ENABLED = process.env.NEXT_PUBLIC_COMMERCE_PROVIDER === 'mzali-api';
const DRAFT_STORAGE_KEY = 'mzali_checkout_draft_id';
const SESSION_ID_KEY = 'mzali_checkout_session_id';

export default function CheckoutPage() {
  const router = useRouter();
  const items = useCart((s) => s.items);
  const clear = useCart((s) => s.clear);
  const total = useMemo(() => items.reduce((s, x) => s + x.price * x.qty, 0), [items]);
  const { t, lang } = useLanguage();
  const isRtl = lang === 'ar';

  const [submitting, setSubmitting] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const [form, setForm] = useState<{
    firstName: string;
    phone: string;
    email: string;
    city: string;
    address: string;
    note: string;
  }>({
    firstName: '',
    phone: '',
    email: '',
    city: '',
    address: '',
    note: '',
  });

  const [couponInput, setCouponInput] = useState('');
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  const shipping = 8;
  const discount = appliedCoupon?.discount ?? 0;
  const grand = Math.max(0, total - discount) + shipping;

  const draftOrderIdRef = useRef<string | undefined>(undefined);
  const isSubmittingRef = useRef<boolean>(false);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const idempotencyKeyRef = useRef<string>('');

  // Initialize session & draft from sessionStorage if present
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let sessionId = sessionStorage.getItem(SESSION_ID_KEY);
    if (!sessionId) {
      sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      sessionStorage.setItem(SESSION_ID_KEY, sessionId);
    }
    idempotencyKeyRef.current = `${sessionId}_${Date.now()}`;

    const existingDraftId = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (existingDraftId) {
      draftOrderIdRef.current = existingDraftId;
    }
  }, []);

  async function applyCoupon() {
    const code = couponInput.trim();
    if (!code) return;
    setApplyingCoupon(true);
    setCouponError(null);
    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotal: total, phone: form.phone }),
      });
      const data = await res.json();
      if (data.valid) {
        setAppliedCoupon({ code: data.code ?? code, discount: Number(data.discount) || 0 });
      } else {
        setAppliedCoupon(null);
        setCouponError(data.reason ?? t.checkout.unknownError);
      }
    } catch {
      setAppliedCoupon(null);
      setCouponError(t.checkout.unknownError);
    } finally {
      setApplyingCoupon(false);
    }
  }

  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponError(null);
    setCouponInput('');
  }

  // Debounced effect to automatically save checkout drafts in background (abandoned checkout recovery)
  // Trigger ONLY when the customer has entered a valid phone number.
  useEffect(() => {
    if (!items.length || isSubmittingRef.current) return;

    // Minimum requirement for draft creation: valid phone number
    if (!isValidPhone(form.phone)) return;

    const delayDebounceFn = setTimeout(async () => {
      if (isSubmittingRef.current) return;
      try {
        const storedDraftId = draftOrderIdRef.current || (typeof window !== 'undefined' ? sessionStorage.getItem(DRAFT_STORAGE_KEY) : undefined);
        const payload = {
          orderId: storedDraftId || undefined,
          customer: {
            firstName: form.firstName.trim(),
            lastName: '',
            phone: form.phone.trim(),
            email: form.email.trim(),
            city: form.city.trim(),
            address: form.address.trim(),
            note: form.note.trim(),
          },
          items,
          shipping,
          paymentMethod: 'cod',
          source: 'storefront-next',
          status: 'checkout-draft', // Mark as checkout-draft (Abandoned) in backend
          ...(appliedCoupon ? { couponCode: appliedCoupon.code } : {}),
        };

        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(idempotencyKeyRef.current ? { 'idempotency-key': `draft_${idempotencyKeyRef.current}` } : {}),
          },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (res.ok && data?.id) {
          draftOrderIdRef.current = data.id;
          if (typeof window !== 'undefined') {
            sessionStorage.setItem(DRAFT_STORAGE_KEY, data.id);
          }
        }
      } catch (err) {
        console.error('Failed to auto-save abandoned checkout draft:', err);
      }
    }, 1500); // 1.5 seconds debounce

    debounceTimeoutRef.current = delayDebounceFn;

    return () => {
      if (delayDebounceFn) clearTimeout(delayDebounceFn);
    };
  }, [form, items, shipping, appliedCoupon]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!items.length) return;

    // Validate phone number
    setPhoneTouched(true);
    if (!isValidPhone(form.phone)) {
      setPhoneError(t.checkout.phoneInvalid);
      // Focus the phone input
      const phoneInput = document.getElementById('checkout-phone-input');
      phoneInput?.focus();
      return;
    }
    setPhoneError(null);

    // Prevent double submission synchronously
    if (isSubmittingRef.current || submitting) return;
    isSubmittingRef.current = true;
    setSubmitting(true);

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    try {
      const storedDraftId = draftOrderIdRef.current || (typeof window !== 'undefined' ? sessionStorage.getItem(DRAFT_STORAGE_KEY) : undefined);
      const payload = {
        orderId: storedDraftId || undefined,
        customer: {
          firstName: form.firstName.trim(),
          lastName: '',
          phone: form.phone.trim(),
          email: form.email.trim(),
          city: form.city.trim(),
          address: form.address.trim(),
          note: form.note.trim(),
        },
        items,
        shipping,
        paymentMethod: 'cod',
        source: 'storefront-next',
        status: 'en-attente',
        ...(appliedCoupon ? { couponCode: appliedCoupon.code } : {}),
      };

      const finalIdempotencyKey = idempotencyKeyRef.current || `confirm_${Date.now()}_${normalizePhone(form.phone)}`;

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': finalIdempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t.checkout.orderFailed);

      // Clean up session draft storage on confirmation
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      }
      clear();

      const num = data.number || data.id;
      const discQuery = appliedCoupon ? `&disc=${appliedCoupon.discount}&code=${encodeURIComponent(appliedCoupon.code)}` : '';
      router.push(`/merci?id=${data.id ?? ''}&n=${encodeURIComponent(num ?? '')}${discQuery}`);
    } catch (err) {
      // Re-enable in case of submission failure
      isSubmittingRef.current = false;
      setSubmitting(false);
      const msg = err instanceof Error ? err.message : t.checkout.unknownError;
      alert(`${t.checkout.alertPrefix}: ${msg}`);
    }
  }

  if (items.length === 0) {
    return (
      <>
        <Header categories={[]} />
        <main className="container-shop py-16 text-center">
          <div className="mx-auto max-w-md rounded-3xl border border-ink-200 bg-white p-8 shadow-card sm:p-10">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-brand-50 text-brand-600">
              <ShoppingBag size={32} />
            </div>
            <h1 className="text-2xl font-black text-ink-900">{t.cart.empty}</h1>
            <p className="mt-2 text-sm text-ink-600">
              {lang === 'ar' ? 'أضف منتجات إلى السلة لإتمام طلبك.' : 'Ajoutez des articles à votre panier pour passer votre commande.'}
            </p>
            <Link
              href="/"
              className="btn-primary mt-6 inline-flex w-full items-center justify-center gap-2 text-base font-bold"
            >
              {t.cart.continueShopping}
              <ArrowRight size={18} className={isRtl ? 'rotate-180' : ''} />
            </Link>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header categories={[]} />
      <main className="container-shop py-6 sm:py-10">
        <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black text-ink-900 sm:text-3xl">{t.checkout.title}</h1>
            <p className="text-xs text-ink-600 sm:text-sm">
              {lang === 'ar' ? 'توصيل سريع ودفع عند الاستلام في جميع أنحاء تونس' : 'Livraison rapide et paiement à la livraison partout en Tunisie'}
            </p>
          </div>
          <div className="mt-2 flex items-center gap-2 self-start rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 sm:mt-0 sm:self-auto">
            <ShieldCheck size={16} />
            <span>{t.checkout.paymentNote}</span>
          </div>
        </div>

        <form onSubmit={submit} className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
          {/* Customer Information (Top on Mobile, Left 7-cols on Desktop) */}
          <div className="space-y-6 lg:col-span-7">
            <div className="card space-y-5 p-4 sm:p-6">
              <div className="flex items-center justify-between border-b border-ink-100 pb-3">
                <h2 className="text-base font-black text-ink-900 sm:text-lg">
                  {t.checkout.contactInfo}
                </h2>
                <span className="rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700">
                  {lang === 'ar' ? 'الهاتف فقط إجباري' : 'Seul le téléphone est requis'}
                </span>
              </div>

              {/* Phone Field (REQUIRED - Prominent) */}
              <div>
                <label htmlFor="checkout-phone-input" className="block text-sm font-bold text-ink-900">
                  <div className="flex items-center justify-between">
                    <span>{t.checkout.phone}</span>
                    <span className="text-xs font-bold text-rose-600">
                      {lang === 'ar' ? 'إجباري' : 'Requis'}
                    </span>
                  </div>
                  <div className="relative mt-1">
                    <input
                      id="checkout-phone-input"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      required
                      placeholder={t.checkout.phonePlaceholder || 'Ex : 20 123 456'}
                      value={form.phone}
                      onChange={(e) => {
                        const val = e.target.value;
                        setForm((prev) => ({ ...prev, phone: val }));
                        if (phoneTouched) {
                          if (isValidPhone(val)) setPhoneError(null);
                          else setPhoneError(t.checkout.phoneInvalid);
                        }
                      }}
                      onBlur={() => {
                        setPhoneTouched(true);
                        if (form.phone && !isValidPhone(form.phone)) {
                          setPhoneError(t.checkout.phoneInvalid);
                        } else {
                          setPhoneError(null);
                        }
                      }}
                      className={`input text-base sm:text-lg font-semibold tracking-wide ${
                        phoneError ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-100' : 'border-ink-300'
                      }`}
                    />
                  </div>
                </label>
                {phoneError && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs font-bold text-rose-600">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{phoneError}</span>
                  </p>
                )}
                <p className="mt-1 text-[11px] text-ink-500">
                  {lang === 'ar'
                    ? 'سنتصل بك على هذا الرقم لتأكيد تفاصيل التوصيل.'
                    : 'Nous vous appellerons sur ce numéro pour confirmer la livraison.'}
                </p>
              </div>

              {/* Optional Fields Grid */}
              <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2">
                {/* Full Name (Optional) */}
                <label className="block text-sm font-semibold text-ink-700">
                  <div className="flex items-center justify-between">
                    <span>{t.checkout.fullName}</span>
                    <span className="text-[11px] font-normal text-ink-400">
                      {lang === 'ar' ? 'اختياري' : 'Optionnel'}
                    </span>
                  </div>
                  <input
                    type="text"
                    autoComplete="name"
                    placeholder={lang === 'ar' ? 'الاسم واللقب' : 'Votre nom et prénom'}
                    className="input mt-1 font-normal text-ink-900"
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  />
                </label>

                {/* City (Optional) */}
                <label className="block text-sm font-semibold text-ink-700">
                  <div className="flex items-center justify-between">
                    <span>{t.checkout.city}</span>
                    <span className="text-[11px] font-normal text-ink-400">
                      {lang === 'ar' ? 'اختياري' : 'Optionnel'}
                    </span>
                  </div>
                  <select
                    className="input mt-1 font-normal text-ink-900"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  >
                    <option value="">{t.checkout.selectCity || 'Sélectionner Ville (optionnel)'}</option>
                    {SITE.cities.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Address (Optional) */}
                <label className="block text-sm font-semibold text-ink-700 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <span>{t.checkout.address}</span>
                    <span className="text-[11px] font-normal text-ink-400">
                      {lang === 'ar' ? 'اختياري' : 'Optionnel'}
                    </span>
                  </div>
                  <input
                    type="text"
                    autoComplete="street-address"
                    placeholder={lang === 'ar' ? 'النهج، الحي، المكان المميز...' : 'Rue, quartier, repère...'}
                    className="input mt-1 font-normal text-ink-900"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                  />
                </label>

                {/* Email (Optional) */}
                <label className="block text-sm font-semibold text-ink-700 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <span>{t.checkout.email}</span>
                    <span className="text-[11px] font-normal text-ink-400">
                      {lang === 'ar' ? 'اختياري' : 'Optionnel'}
                    </span>
                  </div>
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder="exemple@email.com"
                    className="input mt-1 font-normal text-ink-900"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </label>

                {/* Note (Optional) */}
                <label className="block text-sm font-semibold text-ink-700 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <span>{t.checkout.note}</span>
                    <span className="text-[11px] font-normal text-ink-400">
                      {lang === 'ar' ? 'اختياري' : 'Optionnel'}
                    </span>
                  </div>
                  <textarea
                    rows={2}
                    placeholder={
                      lang === 'ar'
                        ? 'أي تفاصيل إضافية بخصوص التوصيل أو المقاس...'
                        : 'Instructions spéciales pour le livreur...'
                    }
                    className="input mt-1 font-normal text-ink-900"
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                  />
                </label>
              </div>
            </div>

            {/* Reassurance Banner */}
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-emerald-900">
              <div className="flex items-start gap-3">
                <Truck className="mt-0.5 shrink-0 text-emerald-600" size={20} />
                <div className="text-xs sm:text-sm">
                  <p className="font-bold">
                    {lang === 'ar' ? 'توصيل في 24 إلى 48 ساعة' : 'Livraison rapide sous 24h à 48h'}
                  </p>
                  <p className="mt-0.5 text-emerald-700">
                    {lang === 'ar'
                      ? 'الدفع نقداً عند استلام الطرد. يمكنك فحص المنتج والتأكد من طلبيتك.'
                      : 'Payez en espèces à la livraison. Vous pouvez vérifier votre colis en toute tranquillité.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Order Summary & Final Confirmation CTA (Below on Mobile, Right 5-cols on Desktop) */}
          <aside className="space-y-6 lg:col-span-5">
            <div className="card p-4 sm:p-6 lg:sticky lg:top-24">
              <div className="flex items-center justify-between border-b border-ink-100 pb-3">
                <h2 className="text-base font-black text-ink-900 sm:text-lg">
                  {t.checkout.yourOrder}
                </h2>
                <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-bold text-ink-700">
                  {items.reduce((s, i) => s + i.qty, 0)} {lang === 'ar' ? 'قطع' : 'articles'}
                </span>
              </div>

              {/* Compact Product List */}
              <ul className="divide-y divide-ink-100 overflow-y-auto max-h-72 py-2">
                {items.map((i) => {
                  const varSummary = i.variation
                    ? Object.entries(i.variation).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ')
                    : '';
                  return (
                    <li key={i.lineId} className="flex items-center gap-3 py-3 first:pt-1 last:pb-1">
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-ink-100 bg-ink-50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={i.image} alt={i.name} className="h-full w-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1 text-xs sm:text-sm">
                        <p className="line-clamp-1 font-bold text-ink-900">
                          {i.name}
                          {i.bundleSlot ? (
                            <span className="ms-1 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-black text-brand-700">
                              {t.product.item} {i.bundleSlot}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-ink-500">
                          <span className="font-semibold text-ink-700">×{i.qty}</span>
                          {varSummary ? ` · ${varSummary}` : ''}
                        </p>
                      </div>
                      <span className="whitespace-nowrap text-xs font-bold text-ink-900 sm:text-sm">
                        {formatPrice(i.price * i.qty)}
                      </span>
                    </li>
                  );
                })}
              </ul>

              {/* Promo Code Section */}
              {COUPONS_ENABLED && (
                <div className="border-t border-ink-100 pt-3">
                  {appliedCoupon ? (
                    <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-xs sm:text-sm">
                      <div className="flex items-center gap-1.5 font-bold text-emerald-700">
                        <Tag size={16} />
                        <span>{t.checkout.couponApplied(appliedCoupon.code)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={removeCoupon}
                        className="font-bold text-rose-600 hover:underline"
                      >
                        {t.checkout.couponRemove}
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="flex gap-2">
                        <input
                          className="input py-2 text-xs sm:text-sm font-normal"
                          placeholder={t.checkout.couponPlaceholder}
                          value={couponInput}
                          onChange={(e) => setCouponInput(e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={applyCoupon}
                          disabled={applyingCoupon || !couponInput.trim()}
                          className="btn-primary shrink-0 px-3 py-2 text-xs sm:text-sm disabled:opacity-50"
                        >
                          {applyingCoupon ? <Loader2 size={16} className="animate-spin" /> : t.checkout.couponApply}
                        </button>
                      </div>
                      {couponError && (
                        <p className="mt-1 text-xs font-bold text-rose-600">{couponError}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Price Calculation Summary */}
              <div className="space-y-2 border-t border-ink-100 pt-3 text-xs sm:text-sm">
                <div className="flex justify-between text-ink-600">
                  <span>{t.cart.subtotal}</span>
                  <span className="font-semibold text-ink-900">{formatPrice(total)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between font-semibold text-emerald-600">
                    <span>{t.checkout.discount}</span>
                    <span>-{formatPrice(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-ink-600">
                  <span>{t.cart.shipping}</span>
                  <span className="font-semibold text-ink-900">{formatPrice(shipping)}</span>
                </div>
                <div className="flex items-baseline justify-between border-t border-ink-200 pt-3">
                  <span className="text-base font-black text-ink-900 sm:text-lg">{t.cart.total}</span>
                  <span className="text-xl font-black text-brand-600 sm:text-2xl">{formatPrice(grand)}</span>
                </div>
              </div>

              {/* Final Confirmation Button */}
              <div className="mt-6">
                <button
                  type="submit"
                  id="checkout-submit-btn"
                  disabled={submitting || !items.length}
                  className="btn-cta w-full py-4 text-base font-black shadow-lg shadow-emerald-600/20 sm:text-lg disabled:opacity-50"
                >
                  {submitting ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={20} className="animate-spin" />
                      {t.checkout.submitting}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <CheckCircle2 size={20} />
                      {t.checkout.confirm}
                    </span>
                  )}
                </button>
                <p className="mt-2 text-center text-xs text-ink-500">
                  {t.checkout.paymentNote}
                </p>
              </div>
            </div>
          </aside>
        </form>
      </main>
      <Footer />
    </>
  );
}
