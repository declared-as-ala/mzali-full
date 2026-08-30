import type { Metadata } from 'next';
import Link from 'next/link';
import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import { CheckCircle2, Truck, Phone, MessageCircle } from 'lucide-react';
import { SITE, formatPrice } from '@/lib/site-config';
import { getSiteSettings } from '@/lib/admin-storage';
import { getDictionary } from '@/lib/i18n';
import { getCurrentLang } from '@/lib/i18n-server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Merci pour votre commande',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function Merci({ searchParams }: { searchParams: Promise<{ id?: string; n?: string; disc?: string; code?: string }> }) {
  const lang = await getCurrentLang();
  const t = getDictionary(lang);
  const { id, n, disc, code } = await searchParams;
  const display = n || id;
  const discount = disc ? Number(disc) : 0;
  const saved = await getSiteSettings();
  const primaryPhone = saved.phones?.[0] ?? SITE.contact.phone;
  const whatsapp = saved.whatsapp ?? SITE.contact.whatsapp;

  return (
    <>
      <Header categories={[]} />
      <main className="container-shop py-12 text-center">
        <div className="mx-auto max-w-2xl rounded-3xl bg-white p-8 shadow-card md:p-12">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 size={44} />
          </div>

          <h1 className="mt-6 text-3xl font-black text-ink-900 md:text-4xl">
            {t.thankYou.title}
          </h1>

          {display && (
            <p className="mt-3 text-ink-700">
              {t.thankYou.received(display)}
            </p>
          )}

          {discount > 0 && (
            <p className="mt-2 text-sm font-bold text-emerald-700">
              {t.checkout.discount}: -{formatPrice(discount)}{code ? ` (${code})` : ''}
            </p>
          )}

          <div className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-brand-500 to-brand-700 px-5 py-3 text-base font-black text-white shadow-soft md:text-lg">
            <Truck size={20} /> {t.thankYou.deliveryBadge}
          </div>

          <p className="mx-auto mt-4 max-w-md text-sm text-ink-700">
            {t.thankYou.keepPhone}
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a
              href={`tel:${primaryPhone}`}
              className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-bold text-ink-900 hover:bg-ink-100"
            >
              <Phone size={16} /> {primaryPhone}
            </a>
            <a
              href={`https://wa.me/216${whatsapp}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#1ebe57]"
            >
              <MessageCircle size={16} /> {t.common.whatsapp}
            </a>
          </div>

          <Link href="/" className="btn-primary mt-8 inline-flex">
            {t.thankYou.continueShopping}
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
