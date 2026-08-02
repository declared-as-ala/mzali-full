'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import { useCart } from '@/lib/cart';
import { SITE, formatPrice } from '@/lib/site-config';
import type { CheckoutPayload } from '@/types';
import { useLanguage } from '@/components/site/LanguageProvider';

const COUPONS_ENABLED = process.env.NEXT_PUBLIC_COMMERCE_PROVIDER === 'mzali-api';

export default function CheckoutPage() {
  const router = useRouter();
  const items = useCart((s) => s.items);
  const clear = useCart((s) => s.clear);
  const total = useMemo(() => items.reduce((s, x) => s + x.price * x.qty, 0), [items]);
  const { t } = useLanguage();

  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<{
    firstName: string;
    phone: string;
    phone2: string;
    email: string;
    city: string;
    address: string;
    note: string;
  }>({
    firstName: '',
    phone: '',
    phone2: '',
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

  const draftOrderIdRef = useRef<string | undefined>(undefined);
  const isSubmittedRef = useRef<boolean>(false);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced effect to automatically save checkout drafts in background (abandoned checkout recovery)
  useEffect(() => {
    if (!items.length || isSubmittedRef.current) return;
    const name = form.firstName.trim();
    const ph = form.phone.trim().replace(/\s/g, '');
    
    // Auto-save only when name is entered and phone has at least 8 digits (valid Tunisian number)
    if (name.length < 2 || ph.length < 8) return;

    const delayDebounceFn = setTimeout(async () => {
      if (isSubmittedRef.current) return;
      try {
        const payload = {
          orderId: draftOrderIdRef.current,
          customer: { ...form, lastName: '' },
          items,
          shipping,
          paymentMethod: 'cod',
          source: 'storefront-next',
          status: 'checkout-draft', // Mark as checkout-draft (Abandoned) in WooCommerce
        };

        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok && data?.id) {
          draftOrderIdRef.current = data.id;
        }
      } catch (err) {
        console.error('Failed to auto-save abandoned checkout draft:', err);
      }
    }, 1500); // 1.5 seconds debounce

    debounceTimeoutRef.current = delayDebounceFn;

    return () => {
      if (delayDebounceFn) clearTimeout(delayDebounceFn);
    };
  }, [form, items, shipping]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!items.length) return;

    // Prevent any pending or future debounced auto-saves from executing
    isSubmittedRef.current = true;
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    setSubmitting(true);
    try {
      const payload = {
        orderId: draftOrderIdRef.current,
        customer: { ...form, lastName: '' },
        items,
        shipping,
        paymentMethod: 'cod',
        source: 'storefront-next',
        status: 'en-attente',
        ...(appliedCoupon ? { couponCode: appliedCoupon.code } : {}),
      };
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t.checkout.orderFailed);
      clear();
      const num = data.number || data.id;
      const discQuery = appliedCoupon ? `&disc=${appliedCoupon.discount}&code=${encodeURIComponent(appliedCoupon.code)}` : '';
      router.push(`/merci?id=${data.id ?? ''}&n=${encodeURIComponent(num ?? '')}${discQuery}`);
    } catch (err) {
      // Re-enable in case of submission failure
      isSubmittedRef.current = false;
      const msg = err instanceof Error ? err.message : t.checkout.unknownError;
      alert(`${t.checkout.alertPrefix}: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Header categories={[]} />
      <main className="container-shop py-10">
        <h1 className="mb-6 text-3xl font-black text-ink-900">{t.checkout.title}</h1>
        <form onSubmit={submit} className="grid gap-8 lg:grid-cols-3">
          <div className="card space-y-4 p-6 lg:col-span-2">
            <h2 className="text-lg font-bold">{t.checkout.contactInfo}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-bold text-ink-700">
                {t.checkout.fullName}
                <input
                  className="input mt-1 font-normal"
                  required
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                />
              </label>
              <label className="block text-sm font-bold text-ink-700">
                {t.checkout.phone}
                <input
                  type="tel"
                  className="input mt-1 font-normal"
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </label>
              <label className="block text-sm font-bold text-ink-700">
                {t.checkout.phone2}
                <input
                  type="tel"
                  className="input mt-1 font-normal"
                  value={form.phone2}
                  onChange={(e) => setForm({ ...form, phone2: e.target.value })}
                />
              </label>
              <label className="block text-sm font-bold text-ink-700">
                {t.checkout.email}
                <input
                  type="email"
                  className="input mt-1 font-normal"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
              <label className="block text-sm font-bold text-ink-700">
                {t.checkout.city}
                <select
                  className="input mt-1 font-normal"
                  required
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                >
                  <option value="">Sélectionner Ville</option>
                  {SITE.cities.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label className="block text-sm font-bold text-ink-700 md:col-span-2">
                {t.checkout.address}
                <input
                  className="input mt-1 font-normal"
                  required
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </label>
              <label className="block text-sm font-bold text-ink-700 md:col-span-2">
                {t.checkout.note}
                <textarea
                  className="input mt-1 font-normal"
                  rows={3}
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </label>
            </div>
          </div>

          <aside className="card h-fit p-6">
            <h2 className="mb-4 text-lg font-bold">{t.checkout.yourOrder}</h2>
            <ul className="space-y-3">
              {items.map((i) => {
                const varSummary = i.variation
                  ? Object.entries(i.variation).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ')
                  : '';
                return (
                  <li key={i.lineId} className="flex items-center gap-3 border-b border-ink-200 pb-3 last:border-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={i.image} alt="" className="h-14 w-14 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="line-clamp-1 font-bold">
                        {i.name}
                        {i.bundleSlot ? <span className="ms-1 rounded bg-brand-100 px-1 py-0.5 text-[9px] font-black text-brand-700">{t.product.item} {i.bundleSlot}</span> : null}
                      </p>
                      <p className="text-ink-700">×{i.qty}{varSummary ? ` · ${varSummary}` : ''}</p>
                    </div>
                    <span className="whitespace-nowrap font-bold">{formatPrice(i.price * i.qty)}</span>
                  </li>
                );
              })}
            </ul>

            {COUPONS_ENABLED && (
              <div className="mt-4 border-t border-ink-200 pt-4">
                {appliedCoupon ? (
                  <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm">
                    <span className="font-bold text-emerald-700">{t.checkout.couponApplied(appliedCoupon.code)}</span>
                    <button type="button" onClick={removeCoupon} className="font-bold text-ink-700 underline">
                      {t.checkout.couponRemove}
                    </button>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-bold text-ink-700">
                      {t.checkout.couponLabel}
                      <div className="mt-1 flex gap-2">
                        <input
                          className="input font-normal"
                          placeholder={t.checkout.couponPlaceholder}
                          value={couponInput}
                          onChange={(e) => setCouponInput(e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={applyCoupon}
                          disabled={applyingCoupon || !couponInput.trim()}
                          className="btn-primary shrink-0 px-4 disabled:opacity-50"
                        >
                          {applyingCoupon ? t.checkout.couponApplying : t.checkout.couponApply}
                        </button>
                      </div>
                    </label>
                    {couponError && <p className="mt-1 text-xs font-bold text-rose-600">{couponError}</p>}
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 space-y-2 border-t border-ink-200 pt-4 text-sm">
              <div className="flex justify-between"><span>{t.cart.subtotal}</span><span>{formatPrice(total)}</span></div>
              {discount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>{t.checkout.discount}</span>
                  <span>-{formatPrice(discount)}</span>
                </div>
              )}
              <div className="flex justify-between"><span>{t.cart.shipping}</span><span>{formatPrice(shipping)}</span></div>
              <div className="mt-2 flex justify-between border-t border-ink-200 pt-2 text-lg font-black">
                <span>{t.cart.total}</span>
                <span className="text-brand-500">{formatPrice(grand)}</span>
              </div>
            </div>
            <button
              disabled={submitting || !items.length}
              className="btn-cta mt-6 w-full disabled:opacity-50"
            >
              {submitting ? t.checkout.submitting : t.checkout.confirm}
            </button>
            <p className="mt-3 text-center text-xs text-ink-700">{t.checkout.paymentNote}</p>
          </aside>
        </form>
      </main>
      <Footer />
    </>
  );
}
