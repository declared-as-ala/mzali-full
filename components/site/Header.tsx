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

function CapIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Cap crown dome */}
      <path d="M4 14a8 8 0 0 1 16 0" />
      {/* Top crown button */}
      <circle cx="12" cy="5.5" r="1" fill="currentColor" />
      {/* Crown panel stitch */}
      <path d="M12 6.5C10 9 9.5 11.5 9.5 14" />
      {/* Visor brim & base */}
      <path d="M3 14h18c1.1 0 2 .9 2 2v.5c0 .8-.7 1.5-1.5 1.5H13l-9-1.5A1.5 1.5 0 0 1 3 15v-1Z" />
    </svg>
  );
}

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
    'relative grid h-9 w-9 sm:h-11 sm:w-11 place-items-center rounded-full text-ink-900 transition hover:bg-ink-100 active:scale-95 shrink-0';

  // Avoid duplicating Casquettes if also present in the dynamic categories list
  const otherCategories = categories.filter((c) => c.slug.toLowerCase() !== 'casquettes');

  return (
    <>
      <div className="announce-bar py-2 text-center text-xs sm:text-sm">{t.nav.announcement}</div>
      <header
        className={`sticky top-0 z-30 border-b transition-all duration-300 ${
          scrolled ? 'border-ink-200 bg-white/85 shadow-card backdrop-blur-xl' : 'border-transparent bg-white'
        }`}
      >
        <div className={`container-shop flex items-center gap-1.5 transition-all duration-300 sm:gap-4 ${scrolled ? 'py-2' : 'py-2.5 sm:py-3'}`}>
          <button className={`${iconBtn} lg:hidden`} onClick={() => setOpen(!open)} aria-label={t.nav.menu} aria-expanded={open}>
            {open ? <X size={21} /> : <Menu size={21} />}
          </button>

          <div className="flex items-center gap-1.5 min-[375px]:gap-2 sm:gap-3.5 shrink-0">
            <Link href="/" className="flex items-center gap-2 sm:gap-3 shrink-0">
              <Image
                src={siteConfig.photoUrl}
                alt={t.common.brandName}
                width={120}
                height={44}
                className="h-9 sm:h-11 w-auto max-h-11 object-contain"
                unoptimized
              />
              <span className="hidden text-lg font-black tracking-tight text-ink-900 md:block">{t.common.brandName}</span>
            </Link>

            {/* Visible on BOTH mobile and desktop immediately next to the logo, with Cap logo icon */}
            <Link
              href="/casquettes"
              className={`inline-flex items-center gap-1 sm:gap-1.5 rounded-full px-2.5 py-1.5 sm:px-3.5 sm:py-1.5 text-[10px] min-[375px]:text-[11px] sm:text-xs font-extrabold uppercase tracking-wider transition-all duration-200 shrink-0 ${
                isActive('/casquettes')
                  ? 'bg-brand-500 text-white shadow-soft ring-2 ring-brand-200'
                  : 'bg-brand-50 text-brand-700 border border-brand-200/80 hover:bg-brand-500 hover:text-white'
              }`}
            >
              <CapIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
              <span>{t.nav.casquettes}</span>
            </Link>
          </div>

          <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex">
            <Link href="/" className={navLink('/')}>{t.nav.home}</Link>
            {otherCategories.map((c) => (
              <Link key={c.slug} href={`/categorie/${c.slug}`} className={navLink(`/categorie/${c.slug}`)}>{c.name}</Link>
            ))}
          </nav>

          <div className="flex flex-1 items-center justify-end gap-0.5 min-[375px]:gap-1 sm:gap-2 lg:flex-none">
            <a
              href={`tel:${primaryPhone}`}
              className="hidden items-center gap-2 rounded-full bg-cta/10 px-4 py-2 text-sm font-bold text-cta-dark transition hover:bg-cta hover:text-white md:inline-flex"
            >
              <Phone size={14} />
              <span dir="ltr">{primaryPhone}</span>
            </a>
            <LanguageSwitcher />
            <Link href="/shop" className={iconBtn} aria-label={t.nav.search}>
              <Search size={19} />
            </Link>
            <Link href="/panier" className={iconBtn} aria-label={t.nav.cart}>
              <ShoppingBag size={19} />
              {count > 0 && (
                <span className="absolute right-0 top-0 sm:right-0.5 sm:top-0.5 grid h-4 min-w-4 sm:h-5 sm:min-w-5 place-items-center rounded-full bg-cta px-1 text-[9px] sm:text-[10px] font-black text-white ring-2 ring-white">
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
              <Link
                href="/"
                className={`flex items-center justify-between rounded-xl px-4 py-3 font-semibold transition ${
                  isActive('/') ? 'bg-brand-50 text-brand-600' : 'text-ink-900 hover:bg-ink-100'
                }`}
              >
                <span>{t.nav.home}</span>
                <ChevronRight size={16} className="text-ink-400 rtl:rotate-180" />
              </Link>

              <Link
                href="/casquettes"
                className={`flex items-center justify-between rounded-xl px-4 py-3 font-bold transition ${
                  isActive('/casquettes') ? 'bg-brand-50 text-brand-600' : 'text-ink-900 hover:bg-ink-100'
                }`}
              >
                <span className="inline-flex items-center gap-2.5">
                  <CapIcon className="h-4 w-4 text-brand-600" />
                  <span>{t.nav.casquettes}</span>
                </span>
                <ChevronRight size={16} className="text-ink-400 rtl:rotate-180" />
              </Link>

              {otherCategories.map((c) => {
                const href = `/categorie/${c.slug}`;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center justify-between rounded-xl px-4 py-3 font-semibold transition ${
                      isActive(href) ? 'bg-brand-50 text-brand-600' : 'text-ink-900 hover:bg-ink-100'
                    }`}
                  >
                    <span>{c.name}</span>
                    <ChevronRight size={16} className="text-ink-400 rtl:rotate-180" />
                  </Link>
                );
              })}

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
