'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Facebook, Instagram, Music2, MessageCircle, Mail, MapPin, Phone, ArrowUpRight, Truck, ShieldCheck, Headphones } from 'lucide-react';
import { SITE } from '@/lib/site-config';
import { useLanguage } from '@/components/site/LanguageProvider';
import { useSiteConfig } from '@/components/site/SiteConfigContext';

const linkCls =
  'group inline-flex items-center gap-1 text-sm text-white/65 transition hover:text-white';

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
    whatsapp: siteConfig.whatsapp,
    phones: siteConfig.phones,
    photoUrl: siteConfig.photoUrl,
  };
  const { email } = SITE.contact;
  const { t } = useLanguage();

  const socials = [
    { href: facebook, label: 'Facebook', icon: Facebook, hover: 'hover:bg-[#1877F2]' },
    { href: instagram, label: 'Instagram', icon: Instagram, hover: 'hover:bg-gradient-to-br hover:from-[#f09433] hover:via-[#dc2743] hover:to-[#bc1888]' },
    { href: tiktok, label: 'TikTok', icon: Music2, hover: 'hover:bg-black' },
    { href: `https://wa.me/216${whatsapp}`, label: t.common.whatsapp, icon: MessageCircle, hover: 'hover:bg-[#25D366]' },
  ];

  const heading = 'mb-4 text-xs font-bold uppercase tracking-[0.18em] text-white';

  return (
    <footer className="relative mt-20 overflow-hidden bg-ink-900 text-white/70">
      {/* accent line + soft glows */}
      <div className="h-1 w-full bg-gradient-to-r from-brand-300 via-brand-200 to-cta" />
      <div aria-hidden className="pointer-events-none absolute -left-32 top-10 h-72 w-72 rounded-full bg-brand-300/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-32 bottom-0 h-72 w-72 rounded-full bg-cta/10 blur-3xl" />

      <div className="container-shop relative">
        {/* trust strip */}
        <div className="grid gap-3 border-b border-white/10 py-8 sm:grid-cols-3">
          {[
            { icon: Truck, text: t.footer.deliveryReturn },
            { icon: ShieldCheck, text: t.footer.terms },
            { icon: Headphones, text: t.footer.contact },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-300/30 text-brand-50">
                <Icon size={18} />
              </span>
              <span className="text-sm font-semibold text-white">{text}</span>
            </div>
          ))}
        </div>

        <div className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
          <div>
            <Link href="/" className="inline-flex items-center gap-3 text-white">
              <Image src={photoUrl} alt={t.common.brandName} width={48} height={48} className="h-12 w-12 rounded-full object-cover ring-2 ring-white/20" unoptimized />
              <span className="text-xl font-black tracking-tight">{t.common.brandName}</span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/60">{t.footer.tagline}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {socials.map(({ href, label, icon: Icon, hover }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener"
                  aria-label={label}
                  className={`grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white transition duration-200 hover:-translate-y-0.5 hover:border-transparent ${hover}`}
                >
                  <Icon size={18} />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className={heading}>{t.footer.boutique}</h4>
            <ul className="space-y-3">
              <li><FooterLink href="/">{t.footer.allProducts}</FooterLink></li>
              <li><FooterLink href="/categorie/nouveautes">{t.footer.newArrivals}</FooterLink></li>
              <li><FooterLink href="/categorie/promotions">{t.footer.promotions}</FooterLink></li>
            </ul>
          </div>

          <div>
            <h4 className={heading}>{t.footer.help}</h4>
            <ul className="space-y-3">
              <li><FooterLink href="/contact">{t.footer.contact}</FooterLink></li>
              <li><FooterLink href="/livraison">{t.footer.deliveryReturn}</FooterLink></li>
              <li><FooterLink href="/cgv">{t.footer.terms}</FooterLink></li>
              <li><FooterLink href="/politique-confidentialite">{t.footer.privacy}</FooterLink></li>
              <li><FooterLink href="/mentions-legales">{t.footer.legal}</FooterLink></li>
            </ul>
          </div>

          <div>
            <h4 className={heading}>{t.footer.contact}</h4>
            <ul className="space-y-3 text-sm">
              {phones.map((p) => (
                <li key={p}>
                  <a href={`tel:${p}`} className="flex items-center gap-3 text-white/70 transition hover:text-white">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10"><Phone size={15} /></span>
                    <span dir="ltr">+216 {p}</span>
                  </a>
                </li>
              ))}
              <li>
                <a href={`https://wa.me/216${whatsapp}`} target="_blank" rel="noopener" className="flex items-center gap-3 text-white/70 transition hover:text-white">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10"><MessageCircle size={15} /></span>
                  <span>{t.common.whatsapp}: <span dir="ltr">{whatsapp}</span></span>
                </a>
              </li>
              <li>
                <a href={`mailto:${email}`} className="flex items-center gap-3 break-all text-white/70 transition hover:text-white">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10"><Mail size={15} /></span>
                  {email}
                </a>
              </li>
              <li className="flex items-center gap-3 text-white/70">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10"><MapPin size={15} /></span>
                {t.footer.location}
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-white/10 py-6 text-xs text-white/45 sm:flex-row">
          <span>© {new Date().getFullYear()} {t.common.brandName}. {t.footer.rights}</span>
          <Link href="/contact" className="inline-flex items-center gap-1 font-semibold text-white/70 transition hover:text-white">
            {t.footer.contact} <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>
    </footer>
  );
}
