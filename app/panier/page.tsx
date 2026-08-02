'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import { useCart } from '@/lib/cart';
import { formatPrice } from '@/lib/site-config';
import { Minus, Plus, Trash2, ShoppingBag } from 'lucide-react';
import { useLanguage } from '@/components/site/LanguageProvider';

export default function PanierPage() {
  const items = useCart((s) => s.items);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const total = useMemo(() => items.reduce((s, x) => s + x.price * x.qty, 0), [items]);
  const { t } = useLanguage();

  return (
    <>
      <Header categories={[]} />
      <main className="container-shop py-10">
        <h1 className="mb-6 text-3xl font-black text-ink-900">{t.cart.title}</h1>
        {!items.length ? (
          <div className="card grid place-items-center p-20 text-center">
            <ShoppingBag size={48} className="mb-4 text-ink-300" />
            <p className="text-lg font-bold">{t.cart.empty}</p>
            <Link href="/" className="btn-primary mt-4">{t.cart.continueShopping}</Link>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="card space-y-4 p-6 lg:col-span-2">
              {items.map((i) => {
                const varSummary = i.variation
                  ? Object.entries(i.variation).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ')
                  : '';
                return (
                  <div key={i.lineId} className="flex flex-wrap items-center gap-4 border-b border-ink-200 pb-4 last:border-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={i.image} alt="" className="h-20 w-20 rounded-xl object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">
                        {i.name}
                        {i.bundleSlot ? <span className="ms-2 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-black text-brand-700">{t.product.item} {i.bundleSlot}</span> : null}
                      </p>
                      <p className="text-sm text-ink-700">{formatPrice(i.price)}</p>
                      {varSummary && <p className="mt-1 text-xs text-ink-700">{varSummary}</p>}
                    </div>
                    <div className="flex items-center rounded-xl border border-ink-200">
                      <button onClick={() => setQty(i.lineId, i.qty - 1)} className="grid h-9 w-9 place-items-center hover:bg-ink-100" aria-label={t.product.decreaseQty}><Minus size={14} /></button>
                      <span className="w-10 text-center font-bold">{i.qty}</span>
                      <button onClick={() => setQty(i.lineId, i.qty + 1)} className="grid h-9 w-9 place-items-center hover:bg-ink-100" aria-label={t.product.increaseQty}><Plus size={14} /></button>
                    </div>
                    <p className="w-24 text-end font-black">{formatPrice(i.price * i.qty)}</p>
                    <button onClick={() => remove(i.lineId)} className="rounded-lg p-2 text-red-500 hover:bg-red-50" aria-label={t.cart.remove}><Trash2 size={16} /></button>
                  </div>
                );
              })}
            </div>
            <aside className="card h-fit p-6">
              <h2 className="mb-4 text-lg font-bold">{t.cart.summary}</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>{t.cart.subtotal}</span><span>{formatPrice(total)}</span></div>
                <div className="flex justify-between"><span>{t.cart.shipping}</span><span className="text-ink-300">{t.cart.shippingNext}</span></div>
                <div className="mt-2 flex justify-between border-t border-ink-200 pt-3 text-lg font-black">
                  <span>{t.cart.total}</span>
                  <span className="text-brand-500">{formatPrice(total)}</span>
                </div>
              </div>
              <Link href="/commande" className="btn-cta mt-6 w-full">{t.cart.checkout}</Link>
            </aside>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
