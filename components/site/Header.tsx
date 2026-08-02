'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ShoppingBag, Search, Menu, X, Phone } from 'lucide-react';
import { useCart } from '@/lib/cart';
import { SITE } from '@/lib/site-config';
import { useState } from 'react';
import { useLanguage } from '@/components/site/LanguageProvider';
import LanguageSwitcher from '@/components/site/LanguageSwitcher';
import { useSiteConfig } from '@/components/site/SiteConfigContext';

export default function Header({ categories }: { categories: { name: string; slug: string }[] }) {
  const items = useCart((s) => s.items);
  const count = items.reduce((n, i) => n + i.qty, 0);
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();
  const siteConfig = useSiteConfig();
  const primaryPhone = siteConfig.phones[0] ?? SITE.contact.phone;

  return (
    <>
      <div className="announce-bar py-2 text-center text-xs sm:text-sm">
        {t.nav.announcement}
      </div>
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/95 backdrop-blur">
        <div className="container-shop flex items-center gap-3 py-3 sm:gap-4">
          <button
            className="grid min-h-11 min-w-11 place-items-center rounded-lg text-ink-900 hover:bg-ink-100 lg:hidden"
            onClick={() => setOpen(!open)}
            aria-label={t.nav.menu}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>

          <Link href="/" className="flex items-center gap-3">
            <Image src={siteConfig.photoUrl} alt={t.common.brandName} width={44} height={44} className="h-11 w-11 rounded-full object-cover" unoptimized />
            <span className="hidden text-lg font-black tracking-tight text-ink-900 sm:block">
              {t.common.brandName}
            </span>
          </Link>

          <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex">
            <Link href="/" className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-900 hover:bg-ink-100">{t.nav.home}</Link>
            {categories.map((c) => (
              <Link key={c.slug} href={`/categorie/${c.slug}`} className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-900 hover:bg-ink-100">{c.name}</Link>
            ))}
          </nav>

          <div className="flex flex-1 items-center justify-end gap-2">
            <a href={`tel:${primaryPhone}`} className="hidden items-center gap-2 rounded-lg bg-cta/10 px-3 py-2 text-sm font-bold text-cta-dark hover:bg-cta/20 sm:inline-flex">
              <Phone size={14} />
              {primaryPhone}
            </a>
            <LanguageSwitcher />
            <Link href="/shop" className="grid min-h-11 min-w-11 place-items-center rounded-lg text-ink-900 hover:bg-ink-100" aria-label={t.nav.search}>
              <Search size={20} />
            </Link>
            <Link href="/panier" className="relative grid min-h-11 min-w-11 place-items-center rounded-lg text-ink-900 hover:bg-ink-100" aria-label={t.nav.cart}>
              <ShoppingBag size={20} />
              {count > 0 && <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-cta text-[10px] font-black text-white">{count}</span>}
            </Link>
          </div>
        </div>

        {open && (
          <nav className="border-t border-ink-200 bg-white p-3 lg:hidden">
            <Link href="/" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 font-semibold text-ink-900">{t.nav.home}</Link>
            {categories.map((c) => (
              <Link key={c.slug} href={`/categorie/${c.slug}`} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 font-semibold text-ink-900">{c.name}</Link>
            ))}
          </nav>
        )}
      </header>
    </>
  );
}
