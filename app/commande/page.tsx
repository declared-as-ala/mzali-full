'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ShieldCheck,
  Truck,
  ShoppingBag,
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  ArrowLeft,
  User,
  Phone,
  MapPin,
  Home,
  Mail,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  Check,
} from 'lucide-react';
import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import { useCart } from '@/lib/cart';
import { SITE, formatPrice } from '@/lib/site-config';
import { useLanguage } from '@/components/site/LanguageProvider';
import { isValidPhone, normalizePhone } from '@/lib/phone';

const DRAFT_STORAGE_KEY = 'mzali_checkout_draft_id';
const SESSION_ID_KEY = 'mzali_checkout_session_id';

export default function CheckoutPage() {
  const router = useRouter();
  const items = useCart((s) => s.items);
  const remove = useCart((s) => s.remove);
  const clear = useCart((s) => s.clear);
  const total = useMemo(() => items.reduce((s, x) => s + x.price * x.qty, 0), [items]);
  const { t, lang } = useLanguage();
  const isRtl = lang === 'ar';

  const [submitting, setSubmitting] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [orderSummaryOpen, setOrderSummaryOpen] = useState(true);

  const [form, setForm] = useState<{
    firstName: string;
    phone: string;
    email: string;
    city: string;
    locality: string;
    firstDeliveryLocalityId: number | null;
    address: string;
    note: string;
  }>({
    firstName: '',
    phone: '',
    email: '',
    city: '',
    locality: '',
    firstDeliveryLocalityId: null,
    address: '',
    note: '',
  });

  // Localité ("Mo3tamadia") options for the selected Ville
  type FirstDeliveryLocality = { locality_id: number; locality_name: string; delegation_name: string; governorate_name: string };
  const [localities, setLocalities] = useState<FirstDeliveryLocality[]>([]);
  const [localitiesLoading, setLocalitiesLoading] = useState(false);
  useEffect(() => {
    if (!form.city) { setLocalities([]); return; }
    let cancelled = false;
    setLocalitiesLoading(true);
    fetch(`/api/firstdelivery/localities?governorate=${encodeURIComponent(form.city)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (!cancelled && Array.isArray(d)) setLocalities(d); })
      .catch(() => { if (!cancelled) setLocalities([]); })
      .finally(() => { if (!cancelled) setLocalitiesLoading(false); });
    return () => { cancelled = true; };
  }, [form.city]);

  const shipping = 8;
  const grand = total + shipping;

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

  // Debounced effect to automatically save checkout drafts in background (abandoned checkout recovery)
  useEffect(() => {
    if (!items.length || isSubmittingRef.current) return;

    if (!isValidPhone(form.phone)) return;

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(async () => {
      try {
        const payload = {
          items: items.map((i) => ({
            productId: i.productId,
            name: i.name,
            price: i.price,
            qty: i.qty,
            variation: i.variation,
            variantId: i.variantId,
            bundleId: i.bundleId,
            bundleName: i.bundleName,
            bundleSlot: i.bundleSlot,
          })),
          customer: {
            name: form.firstName.trim() || undefined,
            phone: normalizePhone(form.phone),
            city: form.city.trim() || undefined,
            locality: form.locality?.trim() || undefined,
            firstDeliveryLocalityId: form.firstDeliveryLocalityId ?? undefined,
            address: form.address.trim() || undefined,
            email: form.email.trim() || undefined,
          },
          shipping,
          note: form.note.trim() || undefined,
          draftId: draftOrderIdRef.current,
        };

        const res = await fetch('/api/orders?draft=true', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.id) {
            draftOrderIdRef.current = data.id;
            if (typeof window !== 'undefined') {
              sessionStorage.setItem(DRAFT_STORAGE_KEY, data.id);
            }
          }
        }
      } catch {
        // Silently ignore background draft sync errors
      }
    }, 800);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [form, items, shipping]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    setPhoneTouched(true);
    if (!isValidPhone(form.phone)) {
      setPhoneError(t.checkout.phoneInvalid);
      const el = document.getElementById('checkout-phone-input');
      if (el) {
        el.focus();
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    if (submitting || isSubmittingRef.current) return;

    if (!items.length) {
      alert(t.cart.empty);
      return;
    }

    isSubmittingRef.current = true;
    setSubmitting(true);

    try {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      const payload = {
        items: items.map((i) => ({
          productId: i.productId,
          name: i.name,
          price: i.price,
          qty: i.qty,
          variation: i.variation,
          variantId: i.variantId,
          bundleId: i.bundleId,
          bundleName: i.bundleName,
          bundleSlot: i.bundleSlot,
        })),
        customer: {
          name: form.firstName.trim() || undefined,
          phone: normalizePhone(form.phone),
          city: form.city.trim() || undefined,
          locality: form.locality?.trim() || undefined,
          firstDeliveryLocalityId: form.firstDeliveryLocalityId ?? undefined,
          address: form.address.trim() || undefined,
          email: form.email.trim() || undefined,
        },
        shipping,
        note: form.note.trim() || undefined,
        draftId: draftOrderIdRef.current,
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

      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      }
      clear();

      const num = data.number || data.id;
      router.push(`/merci?id=${data.id ?? ''}&n=${encodeURIComponent(num ?? '')}`);
    } catch (err) {
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
          <div className="mx-auto max-w-md rounded-3xl border border-neutral-200 bg-white p-8 shadow-card sm:p-10">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-blue-50 text-blue-600">
              <ShoppingBag size={32} />
            </div>
            <h1 className="text-2xl font-black text-neutral-900">{t.cart.empty}</h1>
            <p className="mt-2 text-sm text-neutral-600">
              {lang === 'ar' ? 'أضف منتجات إلى السلة لإتمام طلبك.' : 'Ajoutez des articles à votre panier pour passer votre commande.'}
            </p>
            <Link
              href="/"
              className="btn-primary mt-6 inline-flex w-full items-center justify-center gap-2 text-base font-bold bg-blue-600 hover:bg-blue-700 text-white"
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

      <main className="container-shop py-4 sm:py-8 pb-32 lg:pb-12">
        {/* Top Header & Mobile Back Button (Matching Photo 4) */}
        <div className="mb-4 sm:mb-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Retour"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200/90 bg-white text-neutral-800 shadow-2xs hover:bg-neutral-50 active:scale-95 transition cursor-pointer"
            >
              <ArrowLeft size={18} className={isRtl ? 'rotate-180' : ''} />
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-neutral-900">{t.checkout.title}</h1>
              <p className="text-xs text-neutral-500">
                {lang === 'ar' ? 'توصيل سريع ودفع عند الاستلام في جميع أنحاء تونس' : 'Livraison rapide et paiement à la livraison partout en Tunisie'}
              </p>
            </div>
          </div>

          {/* Stepper / Timeline (Matching Photo 4) */}
          <div className="mt-5 flex items-center justify-between max-w-md mx-auto px-2">
            {/* Step 1: Vos informations (Active) */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm ring-4 ring-blue-100">
                <User size={15} />
              </div>
              <span className="text-[11px] sm:text-xs font-bold text-blue-600">Vos informations</span>
            </div>
            <div className="h-0.5 flex-1 bg-blue-600 mx-2 -mt-5" />

            {/* Step 2: Livraison */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-400">
                <Truck size={15} />
              </div>
              <span className="text-[11px] sm:text-xs font-medium text-neutral-500">Livraison</span>
            </div>
            <div className="h-0.5 flex-1 bg-neutral-200 mx-2 -mt-5" />

            {/* Step 3: Confirmation */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-400">
                <Check size={15} strokeWidth={2.5} />
              </div>
              <span className="text-[11px] sm:text-xs font-medium text-neutral-500">Confirmation</span>
            </div>
          </div>

          {/* Trust Strip (Matching Photo 4) */}
          <div className="mt-5 rounded-2xl border border-blue-100 bg-[#F0F7FF] p-3 flex items-center justify-between text-center gap-1 text-[11px] sm:text-xs font-semibold text-neutral-700">
            <div className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-1">
              <Truck size={15} className="text-blue-600 shrink-0" />
              <span>Livraison toute la Tunisie</span>
            </div>
            <div className="h-5 w-px bg-blue-200/80 mx-1" />
            <div className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-1">
              <ShieldCheck size={15} className="text-blue-600 shrink-0" />
              <span>Paiement à la livraison</span>
            </div>
            <div className="h-5 w-px bg-blue-200/80 mx-1" />
            <div className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-1">
              <RotateCcw size={15} className="text-blue-600 shrink-0" />
              <span>Échange &amp; retour 7 jours</span>
            </div>
          </div>
        </div>

        <form id="checkout-form" onSubmit={submit} className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
          {/* Mobile Collapsible Order Summary Card (Photo 4) */}
          <div className="lg:hidden rounded-2xl border border-neutral-200/90 bg-white p-4 shadow-2xs">
            <button
              type="button"
              onClick={() => setOrderSummaryOpen(!orderSummaryOpen)}
              className="w-full flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center gap-2 font-black text-sm text-neutral-900">
                <ShoppingBag size={18} className="text-blue-600" />
                <span>
                  Votre commande ({items.reduce((s, i) => s + i.qty, 0)} {lang === 'ar' ? 'قطع' : 'articles'})
                </span>
              </div>
              {orderSummaryOpen ? (
                <ChevronUp size={18} className="text-neutral-500" />
              ) : (
                <ChevronDown size={18} className="text-neutral-500" />
              )}
            </button>

            {orderSummaryOpen && (
              <div className="mt-3 pt-3 border-t border-neutral-100 space-y-3">
                <ul className="divide-y divide-neutral-100 max-h-64 overflow-y-auto">
                  {items.map((i) => {
                    const varSummary = i.variation
                      ? Object.entries(i.variation)
                          .filter(([, v]) => v)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(' · ')
                      : '';
                    return (
                      <li key={i.lineId} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                        <div className="relative h-13 w-13 shrink-0 overflow-hidden rounded-xl border border-neutral-100 bg-neutral-50">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={i.image} alt={i.name} className="h-full w-full object-contain p-1" />
                        </div>
                        <div className="min-w-0 flex-1 text-xs sm:text-sm">
                          <p className="line-clamp-1 font-bold text-neutral-900">{i.name}</p>
                          <p className="text-[11px] text-neutral-500">
                            {varSummary ? `${varSummary} · ` : ''}×{i.qty}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-bold text-xs sm:text-sm text-neutral-900">
                            {formatPrice(i.price * i.qty)}
                          </span>
                          <button
                            type="button"
                            onClick={() => remove(i.lineId)}
                            className="text-neutral-400 hover:text-red-500 p-1 cursor-pointer"
                            aria-label={t.cart.remove}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="border-t border-neutral-100 pt-2.5 space-y-1.5 text-xs text-neutral-600">
                  <div className="flex justify-between">
                    <span>{t.cart.subtotal}</span>
                    <span className="font-bold text-neutral-900">{formatPrice(total)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1">
                      <span>{t.cart.shipping}</span>
                      <span className="text-[10px] text-neutral-400">ⓘ</span>
                    </span>
                    <span className="font-bold text-neutral-900">{formatPrice(shipping)}</span>
                  </div>
                </div>

                {/* Total highlight banner (Photo 4) */}
                <div className="rounded-xl bg-[#EFF6FF] border border-blue-100/70 p-3 flex items-center justify-between text-neutral-900">
                  <span className="font-black text-sm">Total à payer</span>
                  <span className="font-black text-lg text-blue-600">{formatPrice(grand)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Customer Information (Left 7-cols on Desktop) */}
          <div className="space-y-6 lg:col-span-7">
            <div className="card space-y-5 p-4 sm:p-6 rounded-2xl border border-neutral-200/90 bg-white shadow-2xs">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                <h2 className="text-base font-black text-neutral-900 sm:text-lg flex items-center gap-2">
                  <User size={18} className="text-blue-600" />
                  <span>{t.checkout.contactInfo}</span>
                </h2>
                <span className="rounded-md bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700">
                  {lang === 'ar' ? 'الهاتف فقط إجباري' : 'Seul le téléphone est requis'}
                </span>
              </div>

              {/* Phone Field (REQUIRED - with Phone Icon) */}
              <div>
                <label htmlFor="checkout-phone-input" className="block text-sm font-bold text-neutral-900">
                  <div className="flex items-center justify-between">
                    <span>{t.checkout.phone}</span>
                    <span className="text-xs font-bold text-rose-600">
                      {lang === 'ar' ? 'إجباري' : 'Requis'}
                    </span>
                  </div>
                  <div className="relative mt-1.5">
                    <Phone
                      size={17}
                      className={`absolute ${isRtl ? 'right-3.5' : 'left-3.5'} top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none`}
                    />
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
                      className={`input ${isRtl ? 'pr-10' : 'pl-10'} text-base font-semibold tracking-wide border-neutral-300 focus:border-blue-600 focus:ring-blue-100 ${
                        phoneError ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-100' : ''
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
                <p className="mt-1.5 text-[11px] text-neutral-500">
                  {lang === 'ar'
                    ? 'سنتصل بك على هذا الرقم لتأكيد تفاصيل التوصيل.'
                    : 'Nous vous appellerons sur ce numéro pour confirmer la livraison.'}
                </p>
              </div>

              {/* Fields Grid with Clean Icons */}
              <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-2">
                {/* Full Name */}
                <label className="block text-sm font-semibold text-neutral-700">
                  <div className="flex items-center justify-between">
                    <span>{t.checkout.fullName}</span>
                    <span className="text-[11px] font-normal text-neutral-400">
                      {lang === 'ar' ? 'اختياري' : 'Optionnel'}
                    </span>
                  </div>
                  <div className="relative mt-1">
                    <User
                      size={17}
                      className={`absolute ${isRtl ? 'right-3.5' : 'left-3.5'} top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none`}
                    />
                    <input
                      type="text"
                      autoComplete="name"
                      placeholder={lang === 'ar' ? 'الاسم واللقب' : 'Votre nom et prénom'}
                      className={`input ${isRtl ? 'pr-10' : 'pl-10'} font-normal text-neutral-900 border-neutral-300 focus:border-blue-600 focus:ring-blue-100`}
                      value={form.firstName}
                      onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    />
                  </div>
                </label>

                {/* City */}
                <label className="block text-sm font-semibold text-neutral-700">
                  <div className="flex items-center justify-between">
                    <span>{t.checkout.city}</span>
                    <span className="text-[11px] font-normal text-neutral-400">
                      {lang === 'ar' ? 'اختياري' : 'Optionnel'}
                    </span>
                  </div>
                  <div className="relative mt-1">
                    <MapPin
                      size={17}
                      className={`absolute ${isRtl ? 'right-3.5' : 'left-3.5'} top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none`}
                    />
                    <select
                      className={`input ${isRtl ? 'pr-10' : 'pl-10'} font-normal text-neutral-900 border-neutral-300 focus:border-blue-600 focus:ring-blue-100`}
                      value={form.city}
                      onChange={(e) =>
                        setForm({ ...form, city: e.target.value, locality: '', firstDeliveryLocalityId: null })
                      }
                    >
                      <option value="">{t.checkout.selectCity || 'Sélectionner votre ville'}</option>
                      {SITE.cities.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>

                {/* Localité / Mo3tamadia (if city picked) */}
                {form.city && (
                  <label className="block text-sm font-semibold text-neutral-700 sm:col-span-2">
                    <div className="flex items-center justify-between">
                      <span>{lang === 'ar' ? 'المعتمدية' : 'Localité (Mo3tamadia)'}</span>
                      <span className="text-[11px] font-normal text-neutral-400">
                        {lang === 'ar' ? 'اختياري' : 'Optionnel'}
                      </span>
                    </div>
                    <div className="relative mt-1">
                      <MapPin
                        size={17}
                        className={`absolute ${isRtl ? 'right-3.5' : 'left-3.5'} top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none`}
                      />
                      <select
                        className={`input ${isRtl ? 'pr-10' : 'pl-10'} font-normal text-neutral-900 border-neutral-300 focus:border-blue-600 focus:ring-blue-100`}
                        value={form.firstDeliveryLocalityId ?? ''}
                        disabled={localitiesLoading}
                        onChange={(e) => {
                          const id = e.target.value ? Number(e.target.value) : null;
                          const picked = localities.find((l) => l.locality_id === id);
                          setForm({ ...form, firstDeliveryLocalityId: id, locality: picked?.delegation_name ?? '' });
                        }}
                      >
                        <option value="">
                          {localitiesLoading
                            ? lang === 'ar'
                              ? 'تحميل…'
                              : 'Chargement…'
                            : lang === 'ar'
                            ? 'اختر المعتمدية (اختياري)'
                            : 'Sélectionner localité (optionnel)'}
                        </option>
                        {Object.entries(
                          localities.reduce<Record<string, typeof localities>>((groups, l) => {
                            (groups[l.delegation_name] ??= []).push(l);
                            return groups;
                          }, {}),
                        ).map(([delegation, group]) => (
                          <optgroup key={delegation} label={delegation}>
                            {group.map((l) => (
                              <option key={l.locality_id} value={l.locality_id}>
                                {l.locality_name}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  </label>
                )}

                {/* Address */}
                <label className="block text-sm font-semibold text-neutral-700 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <span>{t.checkout.address}</span>
                    <span className="text-[11px] font-normal text-neutral-400">
                      {lang === 'ar' ? 'اختياري' : 'Optionnel'}
                    </span>
                  </div>
                  <div className="relative mt-1">
                    <Home
                      size={17}
                      className={`absolute ${isRtl ? 'right-3.5' : 'left-3.5'} top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none`}
                    />
                    <input
                      type="text"
                      autoComplete="street-address"
                      placeholder={lang === 'ar' ? 'النهج، الحي، المكان المميز...' : 'Rue, quartier, repère...'}
                      className={`input ${isRtl ? 'pr-10' : 'pl-10'} font-normal text-neutral-900 border-neutral-300 focus:border-blue-600 focus:ring-blue-100`}
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                    />
                  </div>
                </label>

                {/* Email */}
                <label className="block text-sm font-semibold text-neutral-700 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <span>{t.checkout.email}</span>
                    <span className="text-[11px] font-normal text-neutral-400">
                      {lang === 'ar' ? 'اختياري' : 'Optionnel'}
                    </span>
                  </div>
                  <div className="relative mt-1">
                    <Mail
                      size={17}
                      className={`absolute ${isRtl ? 'right-3.5' : 'left-3.5'} top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none`}
                    />
                    <input
                      type="email"
                      autoComplete="email"
                      placeholder="exemple@email.com"
                      className={`input ${isRtl ? 'pr-10' : 'pl-10'} font-normal text-neutral-900 border-neutral-300 focus:border-blue-600 focus:ring-blue-100`}
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </div>
                </label>

                {/* Note */}
                <label className="block text-sm font-semibold text-neutral-700 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <span>{t.checkout.note}</span>
                    <span className="text-[11px] font-normal text-neutral-400">
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
                    className="input mt-1 font-normal text-neutral-900 border-neutral-300 focus:border-blue-600 focus:ring-blue-100"
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                  />
                </label>
              </div>
            </div>

            {/* Delivery Reassurance Banner (Matching Photo 4) */}
            <div className="rounded-2xl border border-emerald-200 bg-[#F0FDF4] p-3.5 sm:p-4 text-emerald-950 flex items-start gap-3">
              <Truck className="mt-0.5 shrink-0 text-emerald-600" size={20} />
              <div className="text-xs sm:text-sm">
                <p className="font-bold">
                  {lang === 'ar' ? 'توصيل سريع في 24 إلى 48 ساعة' : 'Livraison rapide sous 24h à 48h'}
                </p>
                <p className="mt-0.5 text-emerald-700">
                  {lang === 'ar'
                    ? 'الدفع نقداً عند استلام الطرد. يمكنك فحص المنتج والتأكد من طلبيتك.'
                    : 'Payez en espèces à la livraison. Vous pouvez vérifier votre colis en toute tranquillité.'}
                </p>
              </div>
            </div>
          </div>

          {/* Desktop Order Summary (Right 5-cols on Desktop) */}
          <aside className="hidden lg:block space-y-6 lg:col-span-5">
            <div className="card p-5 sm:p-6 rounded-2xl border border-neutral-200/90 bg-white shadow-card lg:sticky lg:top-24">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                <h2 className="text-base font-black text-neutral-900 sm:text-lg flex items-center gap-2">
                  <ShoppingBag size={18} className="text-blue-600" />
                  <span>{t.checkout.yourOrder}</span>
                </h2>
                <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-bold text-neutral-700">
                  {items.reduce((s, i) => s + i.qty, 0)} {lang === 'ar' ? 'قطع' : 'articles'}
                </span>
              </div>

              {/* Product List */}
              <ul className="divide-y divide-neutral-100 overflow-y-auto max-h-72 py-2">
                {items.map((i) => {
                  const varSummary = i.variation
                    ? Object.entries(i.variation)
                        .filter(([, v]) => v)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(' · ')
                    : '';
                  return (
                    <li key={i.lineId} className="flex items-center gap-3 py-3 first:pt-1 last:pb-1">
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-neutral-100 bg-neutral-50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={i.image} alt={i.name} className="h-full w-full object-contain p-1" />
                      </div>
                      <div className="min-w-0 flex-1 text-xs sm:text-sm">
                        <p className="line-clamp-1 font-bold text-neutral-900">
                          {i.name}
                          {i.bundleSlot ? (
                            <span className="ms-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-black text-blue-700">
                              {t.product.item} {i.bundleSlot}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-neutral-500">
                          <span className="font-semibold text-neutral-700">×{i.qty}</span>
                          {varSummary ? ` · ${varSummary}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="whitespace-nowrap text-xs font-bold text-neutral-900 sm:text-sm">
                          {formatPrice(i.price * i.qty)}
                        </span>
                        <button
                          type="button"
                          onClick={() => remove(i.lineId)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-rose-50 hover:text-rose-600 transition cursor-pointer"
                          title={t.cart.remove}
                          aria-label={t.cart.remove}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Price Breakdown */}
              <div className="space-y-2 border-t border-neutral-100 pt-3 text-xs sm:text-sm">
                <div className="flex justify-between text-neutral-600">
                  <span>{t.cart.subtotal}</span>
                  <span className="font-semibold text-neutral-900">{formatPrice(total)}</span>
                </div>
                <div className="flex justify-between text-neutral-600">
                  <span className="flex items-center gap-1">
                    <span>{t.cart.shipping}</span>
                    <span className="text-[11px] text-neutral-400">ⓘ</span>
                  </span>
                  <span className="font-semibold text-neutral-900">{formatPrice(shipping)}</span>
                </div>
                <div className="flex items-baseline justify-between border-t border-neutral-200 pt-3">
                  <span className="text-base font-black text-neutral-900 sm:text-lg">{t.cart.total}</span>
                  <span className="text-xl font-black text-blue-600 sm:text-2xl">{formatPrice(grand)}</span>
                </div>
              </div>

              {/* Desktop Submit Button */}
              <div className="mt-6">
                <button
                  type="submit"
                  id="checkout-submit-btn-desktop"
                  disabled={submitting || !items.length}
                  className="w-full py-4 px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-black text-base sm:text-lg flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 disabled:opacity-50 cursor-pointer transition-all"
                >
                  {submitting ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={20} className="animate-spin" />
                      {t.checkout.submitting}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <CheckCircle2 size={20} />
                      <span>{t.checkout.confirm}</span>
                      <ArrowRight size={20} />
                    </span>
                  )}
                </button>
                <p className="mt-2 text-center text-xs text-neutral-500">
                  {t.checkout.paymentNote}
                </p>
              </div>
            </div>
          </aside>
        </form>
      </main>

      {/* Pinned Mobile Confirmation Bottom Bar (Matching Photo 4) */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200/90 bg-white/95 backdrop-blur-md px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] shadow-[0_-4px_25px_rgba(0,0,0,0.1)] lg:hidden">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">{t.cart.total}</p>
            <p className="truncate text-xl font-black text-blue-600">{formatPrice(grand)}</p>
          </div>
          <button
            type="submit"
            form="checkout-form"
            id="checkout-submit-btn-mobile"
            disabled={submitting || !items.length}
            className="flex-1 max-w-[260px] py-3.5 px-5 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-md shadow-blue-600/20 disabled:opacity-50 cursor-pointer transition-all"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 size={18} className="animate-spin" />
                {t.checkout.submitting}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 size={18} />
                <span>{t.checkout.confirm}</span>
                <ArrowRight size={18} />
              </span>
            )}
          </button>
        </div>
      </div>

      <Footer />
    </>
  );
}
