'use client';

import Link from 'next/link';
import Image from 'next/image';
import {
  Facebook,
  Instagram,
  Music2,
  MessageCircle,
  Mail,
  MapPin,
  Phone,
} from 'lucide-react';
import { SITE } from '@/lib/site-config';
import { useLanguage } from '@/components/site/LanguageProvider';
import { useSiteConfig } from '@/components/site/SiteConfigContext';

const linkCls =
  'group inline-flex items-center gap-1 text-xs sm:text-sm text-white/70 transition hover:text-white py-1';

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={linkCls}>
      <span className="relative">
        {children}
        <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-brand-100 transition-all duration-300 group-hover:w-full" />
      </span>
    </Link>
  );
}

export default function Footer() {
  const siteConfig = useSiteConfig();
  const { facebook, instagram, tiktok, whatsapp, phones, photoUrl } = {
    facebook: siteConfig.facebook,
    instagram: siteConfig.instagram,
    tiktok: siteConfig.tiktok,
    whatsapp: siteConfig.whatsapp || '22479443',
    phones: siteConfig.phones?.length ? siteConfig.phones : ['22479443'],
    photoUrl: siteConfig.photoUrl,
  };
  const primaryPhone = phones[0] || '22479443';
  const email = SITE.contact.email || 'mzaliahmed73@gmail.com';
  const { t } = useLanguage();

  const socials = [
    { href: facebook, label: 'Facebook', icon: Facebook, hover: 'hover:bg-[#1877F2]' },
    { href: instagram, label: 'Instagram', icon: Instagram, hover: 'hover:bg-gradient-to-br hover:from-[#f09433] hover:via-[#dc2743] hover:to-[#bc1888]' },
    { href: tiktok, label: 'TikTok', icon: Music2, hover: 'hover:bg-black' },
    { href: `https://wa.me/216${whatsapp}`, label: t.common.whatsapp, icon: MessageCircle, hover: 'hover:bg-[#25D366]' },
  ];

  return (
    <footer className="relative mt-8 sm:mt-14 lg:mt-20 overflow-hidden bg-ink-900 text-white/70">
      {/* Accent gradient line + ambient glow */}
      <div className="h-1 w-full bg-gradient-to-r from-brand-300 via-brand-200 to-cta" />
      <div aria-hidden className="pointer-events-none absolute -left-32 top-10 h-72 w-72 rounded-full bg-brand-300/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-32 bottom-0 h-72 w-72 rounded-full bg-cta/10 blur-3xl" />

      <div className="container-shop relative py-8 sm:py-12">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
          {/* Brand & Socials Column */}
          <div className="lg:col-span-5 space-y-4">
            <Link href="/" className="inline-flex items-center gap-3 text-white">
              <Image
                src={photoUrl}
                alt={t.common.brandName}
                width={120}
                height={44}
                className="h-10 sm:h-11 w-auto max-h-11 object-contain"
                unoptimized
              />
              <span className="text-xl font-black tracking-tight">{t.common.brandName}</span>
            </Link>
            <p className="max-w-md text-xs sm:text-sm leading-relaxed text-white/60">
              {t.footer.tagline}
            </p>

            <div className="flex flex-wrap gap-2 pt-2">
              {socials.map(({ href, label, icon: Icon, hover }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener"
                  aria-label={label}
                  className={`grid h-9 w-9 sm:h-10 sm:w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white transition duration-200 hover:-translate-y-0.5 hover:border-transparent ${hover}`}
                >
                  <Icon size={17} />
                </a>
              ))}
            </div>
          </div>

          {/* Quick Navigation Column */}
          <div className="lg:col-span-3">
            <h4 className="text-xs font-black uppercase tracking-[0.18em] text-white mb-3 sm:mb-4">
              {t.footer.boutique}
            </h4>
            <ul className="space-y-2">
              <li>
                <FooterLink href="/">{t.footer.allProducts}</FooterLink>
              </li>
              <li>
                <FooterLink href="/categorie/nouveautes">{t.footer.newArrivals}</FooterLink>
              </li>
              <li>
                <FooterLink href="/categorie/promotions">{t.footer.promotions}</FooterLink>
              </li>
            </ul>
          </div>

          {/* Highlighted Contact Column (Mise en valeur) */}
          <div className="lg:col-span-4">
            <h4 className="text-xs font-black uppercase tracking-[0.18em] text-white mb-3 sm:mb-4">
              Contact &amp; Commandes
            </h4>
            <div className="space-y-2.5">
              {/* Phone call pill */}
              <a
                href={`tel:${primaryPhone}`}
                className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/5 p-3 sm:p-3.5 text-white transition hover:bg-white/10 hover:border-white/30"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-600/30 text-blue-400">
                  <Phone size={18} />
                </span>
                <div>
                  <span className="text-[11px] font-medium text-white/60 block">Téléphone direct</span>
                  <span className="text-sm sm:text-base font-black tracking-wide" dir="ltr">
                    +216 {primaryPhone}
                  </span>
                </div>
              </a>

              {/* WhatsApp direct pill */}
              <a
                href={`https://wa.me/216${whatsapp}`}
                target="_blank"
                rel="noopener"
                className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 sm:p-3.5 text-white transition hover:bg-emerald-500/20 hover:border-emerald-500/50"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#25D366] text-white shadow-sm">
                  <MessageCircle size={18} />
                </span>
                <div>
                  <span className="text-[11px] font-medium text-emerald-300 block">WhatsApp direct</span>
                  <span className="text-sm sm:text-base font-black tracking-wide" dir="ltr">
                    WhatsApp: {whatsapp}
                  </span>
                </div>
              </a>

              {/* Email */}
              <a
                href={`mailto:${email}`}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-xs sm:text-sm text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-white/80">
                  <Mail size={15} />
                </span>
                <span className="truncate font-semibold">{email}</span>
              </a>

              {/* Location */}
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-xs sm:text-sm text-white/80">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-white/80">
                  <MapPin size={15} />
                </span>
                <span className="font-semibold">Tunis, Tunisie</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Copyright */}
        <div className="mt-8 border-t border-white/10 pt-6 text-center text-xs text-white/45 sm:flex sm:items-center sm:justify-between sm:text-left">
          <span>© {new Date().getFullYear()} {t.common.brandName}. Tous droits réservés.</span>
          <span className="mt-2 block sm:mt-0 text-white/60 font-semibold">Tunis, Tunisie</span>
        </div>
      </div>
    </footer>
  );
}