'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, Truck, ShieldCheck, RotateCcw, Sparkles, Phone } from 'lucide-react';
import { SITE } from '@/lib/site-config';
import { useLanguage } from '@/components/site/LanguageProvider';

export default function Hero() {
  const { lang, t } = useLanguage();
  const ArrowIcon = lang === 'ar' ? ArrowLeft : ArrowRight;

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_-10%,rgba(255,255,255,.20),transparent_45%),radial-gradient(circle_at_88%_115%,rgba(34,191,89,.28),transparent_50%)]" />
      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:60px_60px]" />

      <div className="container-shop relative py-2 md:py-3 lg:py-4">
        <div className="relative z-10">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-white backdrop-blur ring-1 ring-white/20">
            <Sparkles size={12} /> {t.hero.collection}
          </span>

          <h1 className="mt-1 text-xl font-black leading-[1.05] tracking-tight sm:text-2xl md:text-3xl lg:text-4xl">
            {t.common.brandName}
          </h1>

          <p className="mt-1 max-w-xl text-xs font-semibold text-white/90 sm:text-sm md:text-base">
            {t.hero.title}
          </p>

          <div className="mt-1 flex flex-wrap gap-1.5 md:hidden">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-[11px] font-black text-brand-700 shadow-lg">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-cta text-white"><Sparkles size={10} /></span>
              {t.hero.topSale}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-[11px] font-black text-brand-700 shadow-lg">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cta" />
              {t.hero.deliveryTunisia}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cta px-3 py-1 text-[11px] font-black text-white shadow-cta">
              {t.hero.cashOnDelivery}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Link href="#produits" className="btn-cta shake-cta text-xs md:text-sm">
              {t.common.buyNow} <ArrowIcon size={16} />
            </Link>
            <a
              href={`tel:${SITE.contact.phone}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/30 bg-white/10 px-2 py-1.5 text-xs font-bold text-white backdrop-blur transition hover:bg-white/20"
            >
              <Phone size={14} /> {SITE.contact.phone}
            </a>
          </div>

          <div className="mt-2 grid max-w-md grid-cols-3 gap-1.5 text-[10px] sm:text-xs">
            <span className="inline-flex items-center gap-1.5 text-white/90"><Truck size={15} className="text-cta" /> {t.hero.deliveryTime}</span>
            <span className="inline-flex items-center gap-1.5 text-white/90"><ShieldCheck size={15} className="text-cta" /> {t.hero.paymentCod}</span>
            <span className="inline-flex items-center gap-1.5 text-white/90"><RotateCcw size={15} className="text-cta" /> {t.hero.easyExchange}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
