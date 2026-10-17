'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ShoppingBag, Search, Menu, X, Phone, ChevronRight } from 'lucide-react';
import { useCart } from '@/lib/cart';
import { SITE } from '@/lib/site-config';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/components/site/LanguageProvider';
import LanguageSwitcher from '@/components/site/LanguageSwitcher';
import { useSiteConfig } from '@/components/site/SiteConfigContext';

export default function Header({ categories }: { categories: { name: string; slug: string }[] }) {
  const items = useCart((s) => s.items);
  const count = items.reduce((n, i) => n + i.qty, 0);
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { t } = useLanguage();
  const siteConfig = useSiteConfig();
  const pathname = usePathname();
  const primaryPhone = siteConfig.phones[0] ?? SITE.contact.phone;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname?.startsWith(href));
  const navLink = (href: string) =>
    `relative rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
      isActive(href) ? 'bg-brand-300 text-white shadow-soft' : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900'
    }`;
  const iconBtn =
    'relative grid h-11 w-11 place-items-center rounded-full text-ink-900 transition hover:bg-ink-100 active:scale-95';

  return (
    <>
      <div className="announce-bar py-2 text-center text-xs sm:text-sm">{t.nav.announcement}</div>
      <header
        className={`sticky top-0 z-30 border-b transition-all duration-300 ${
          scrolled ? 'border-ink-200 bg-white/85 shadow-card backdrop-blur-xl' : 'border-transparent bg-white'
        }`}
      >
        <div className={`container-shop flex items-center gap-2 transition-all duration-300 sm:gap-4 ${scrolled ? 'py-2' : 'py-3'}`}>
          <button className={`${iconBtn} lg:hidden`} onClick={() => setOpen(!open)} aria-label={t.nav.menu} aria-expanded={open}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>

          <Link href="/" className="flex items-center gap-3">
            <Image
              src={siteConfig.photoUrl}
              alt={t.common.brandName}
              width={44}
              height={44}
              className="h-11 w-11 rounded-full object-cover ring-2 ring-brand-50"
              unoptimized
            />
            <span className="hidden text-lg font-black tracking-tight text-ink-900 sm:block">{t.common.brandName}</span>
          </Link>

          <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex">
            <Link href="/" className={navLink('/')}>{t.nav.home}</Link>
            {categories.map((c) => (
              <Link key={c.slug} href={`/categorie/${c.slug}`} className={navLink(`/categorie/${c.slug}`)}>{c.name}</Link>
            ))}
          </nav>

          <div className="flex flex-1 items-center justify-end gap-1 sm:gap-2 lg:flex-none">
            <a
              href={`tel:${primaryPhone}`}
              className="hidden items-center gap-2 rounded-full bg-cta/10 px-4 py-2 text-sm font-bold text-cta-dark transition hover:bg-cta hover:text-white md:inline-flex"
            >
              <Phone size={14} />
              <span dir="ltr">{primaryPhone}</span>
            </a>
            <LanguageSwitcher />
            <Link href="/shop" className={iconBtn} aria-label={t.nav.search}>
              <Search size={20} />
            </Link>
            <Link href="/panier" className={iconBtn} aria-label={t.nav.cart}>
              <ShoppingBag size={20} />
              {count > 0 && (
                <span className="absolute right-0.5 top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-cta px-1 text-[10px] font-black text-white ring-2 ring-white">
                  {count}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* mobile drawer */}
        <div className={`grid transition-all duration-300 lg:hidden ${open ? 'grid-rows-[1fr] border-t border-ink-200' : 'grid-rows-[0fr]'}`}>
          <nav className="overflow-hidden bg-white">
            <div className="space-y-1 p-3">
              {[{ name: t.nav.home, href: '/' }, ...categories.map((c) => ({ name: c.name, href: `/categorie/${c.slug}` }))].map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`flex items-center justify-between rounded-xl px-4 py-3 font-semibold transition ${
                    isActive(l.href) ? 'bg-brand-50 text-brand-600' : 'text-ink-900 hover:bg-ink-100'
                  }`}
                >
                  {l.name}
                  <ChevronRight size={16} className="text-ink-400 rtl:rotate-180" />
                </Link>
              ))}
              <a href={`tel:${primaryPhone}`} className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-cta px-4 py-3 font-bold text-white">
                <Phone size={16} />
                <span dir="ltr">{primaryPhone}</span>
              </a>
            </div>
          </nav>
        </div>
      </header>
    </>
  );
}
