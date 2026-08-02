import './globals.css';
import type { Metadata } from 'next';
import { LanguageProvider } from '@/components/site/LanguageProvider';
import { SiteConfigProvider } from '@/components/site/SiteConfigContext';
import { getDirection } from '@/lib/i18n';
import { getCurrentLang } from '@/lib/i18n-server';
import { getSiteSettings } from '@/lib/admin-storage';
import { SITE } from '@/lib/site-config';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: process.env.NEXT_PUBLIC_SITE_NAME ?? 'Mzali Boutique', template: `%s — ${process.env.NEXT_PUBLIC_SITE_NAME ?? 'Mzali Boutique'}` },
  description: 'Boutique de prêt-à-porter — livraison partout en Tunisie.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  icons: { icon: '/icon.svg' },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getCurrentLang();
  const dir = getDirection(lang);
  const saved = await getSiteSettings();

  const contact = {
    photoUrl: saved.photoUrl ?? SITE.logo,
    phones: saved.phones?.length ? saved.phones : [SITE.contact.phone],
    whatsapp: saved.whatsapp ?? SITE.contact.whatsapp,
    instagram: saved.instagram ?? SITE.contact.instagram,
    tiktok: saved.tiktok ?? SITE.contact.tiktok,
    facebook: saved.facebook ?? SITE.contact.facebook,
  };

  return (
    <html lang={lang} dir={dir}>
      <body className={lang === 'ar' ? 'rtl' : undefined}>
        <LanguageProvider initialLang={lang}>
          <SiteConfigProvider contact={contact}>
            {children}
          </SiteConfigProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
