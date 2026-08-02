'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Facebook, Instagram, Music2, MessageCircle, Mail, MapPin, Phone } from 'lucide-react';
import { SITE } from '@/lib/site-config';
import { useLanguage } from '@/components/site/LanguageProvider';
import { useSiteConfig } from '@/components/site/SiteConfigContext';

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

  return (
    <footer className="mt-20 bg-brand-700 text-white/80">
      <div className="container-shop grid gap-10 py-12 lg:grid-cols-4">
        <div>
          <Link href="/" className="flex items-center gap-3 text-white">
            <Image src={photoUrl} alt={t.common.brandName} width={44} height={44} className="h-11 w-11 rounded-full object-cover" unoptimized />
            <span className="text-lg font-black">{t.common.brandName}</span>
          </Link>
          <p className="mt-3 text-sm text-white/60">{t.footer.tagline}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={facebook} target="_blank" rel="noopener" className="rounded-lg bg-white/10 p-2.5 transition hover:bg-[#1877F2]" aria-label="Facebook"><Facebook size={18} /></a>
            <a href={instagram} target="_blank" rel="noopener" className="rounded-lg bg-white/10 p-2.5 transition hover:bg-gradient-to-br hover:from-[#f09433] hover:via-[#dc2743] hover:to-[#bc1888]" aria-label="Instagram"><Instagram size={18} /></a>
            <a href={tiktok} target="_blank" rel="noopener" className="rounded-lg bg-white/10 p-2.5 transition hover:bg-black" aria-label="TikTok"><Music2 size={18} /></a>
            <a href={`https://wa.me/216${whatsapp}`} target="_blank" rel="noopener" className="rounded-lg bg-white/10 p-2.5 transition hover:bg-[#25D366]" aria-label={t.common.whatsapp}><MessageCircle size={18} /></a>
          </div>
        </div>

        <div>
          <h4 className="mb-3 font-bold text-white">{t.footer.boutique}</h4>
          <ul className="space-y-2 text-sm">
            <li><Link href="/" className="hover:text-white">{t.footer.allProducts}</Link></li>
            <li><Link href="/categorie/nouveautes" className="hover:text-white">{t.footer.newArrivals}</Link></li>
            <li><Link href="/categorie/promotions" className="hover:text-white">{t.footer.promotions}</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="mb-3 font-bold text-white">{t.footer.help}</h4>
          <ul className="space-y-2 text-sm">
            <li><Link href="/livraison" className="hover:text-white">{t.footer.deliveryReturn}</Link></li>
            <li><Link href="/contact" className="hover:text-white">{t.footer.contact}</Link></li>
            <li><Link href="/cgv" className="hover:text-white">{t.footer.terms}</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="mb-3 font-bold text-white">{t.footer.contact}</h4>
          <ul className="space-y-2 text-sm">
            {phones.map((p) => (
              <li key={p} className="flex items-center gap-2"><Phone size={16} /> <a href={`tel:${p}`}>+216 {p}</a></li>
            ))}
            <li className="flex items-center gap-2"><MessageCircle size={16} /> <a href={`https://wa.me/216${whatsapp}`} target="_blank" rel="noopener">{t.common.whatsapp}: {whatsapp}</a></li>
            <li className="flex items-center gap-2"><Mail size={16} /> <a href={`mailto:${email}`}>{email}</a></li>
            <li className="flex items-center gap-2"><MapPin size={16} /> {t.footer.location}</li>
          </ul>
        </div>
      </div>

      <a
        href={`https://wa.me/216${whatsapp}`}
        target="_blank"
        rel="noopener"
        aria-label={t.common.whatsapp}
        className="fixed bottom-5 right-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-white shadow-2xl transition hover:scale-110"
      >
        <MessageCircle size={26} />
      </a>

      <div className="border-t border-white/10 py-4 text-center text-xs text-white/50">
        © {new Date().getFullYear()} {t.common.brandName}. {t.footer.rights}
      </div>
    </footer>
  );
}
