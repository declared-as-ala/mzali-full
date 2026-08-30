import './globals.css';
import type { Metadata } from 'next';
import { LanguageProvider } from '@/components/site/LanguageProvider';
import { SiteConfigProvider } from '@/components/site/SiteConfigContext';
import { getDirection } from '@/lib/i18n';
import { getCurrentLang } from '@/lib/i18n-server';
import { getSiteSettings } from '@/lib/admin-storage';
import { SITE } from '@/lib/site-config';

export const dynamic = 'force-dynamic';

const fbVerificationToken = process.env.NEXT_PUBLIC_FACEBOOK_DOMAIN_VERIFICATION || process.env.FACEBOOK_DOMAIN_VERIFICATION || '';

export const metadata: Metadata = {
  title: {
    default: 'Boutique Ahmed Mzali — Prêt-à-porter & Accessoires Tunisie',
    template: '%s — Boutique Ahmed Mzali',
  },
  description: 'Boutique Ahmed Mzali : Découvrez nos collections de vêtements et chaussures tendance. Livraison rapide 24-48h partout en Tunisie, paiement à la livraison (COD).',
  metadataBase: new URL('https://ahmedmzaliboutique.tn'),
  alternates: {
    canonical: 'https://ahmedmzaliboutique.tn/',
  },
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
  openGraph: {
    type: 'website',
    locale: 'fr_TN',
    url: 'https://ahmedmzaliboutique.tn/',
    siteName: 'Boutique Ahmed Mzali',
    title: 'Boutique Ahmed Mzali — Prêt-à-porter & Accessoires en Tunisie',
    description: 'Boutique Ahmed Mzali : Vêtements, chaussures et accessoires tendance. Livraison rapide 24-48h sur toute la Tunisie, paiement à la livraison (COD).',
    images: [
      {
        url: 'https://ahmedmzaliboutique.tn/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Boutique Ahmed Mzali — Prêt-à-porter Tunisie',
        type: 'image/jpeg',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Boutique Ahmed Mzali — Prêt-à-porter & Accessoires en Tunisie',
    description: 'Boutique Ahmed Mzali : Vêtements, chaussures et accessoires tendance. Livraison 24-48h partout en Tunisie.',
    images: ['https://ahmedmzaliboutique.tn/og-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  ...(fbVerificationToken
    ? {
        other: {
          'facebook-domain-verification': fbVerificationToken,
        },
      }
    : {}),
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

  const primaryPhone = contact.phones[0] ?? SITE.contact.phone;

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'OnlineStore',
    name: 'Boutique Ahmed Mzali',
    url: 'https://ahmedmzaliboutique.tn',
    logo: 'https://ahmedmzaliboutique.tn/hero.webp',
    image: 'https://ahmedmzaliboutique.tn/og-image.jpg',
    description: 'Boutique de prêt-à-porter et accessoires pour homme en Tunisie. Livraison express 24-48h partout en Tunisie, paiement à la livraison.',
    telephone: `+216${primaryPhone}`,
    priceRange: 'DT',
    currenciesAccepted: 'TND',
    paymentAccepted: 'Cash on Delivery',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'TN',
      addressLocality: 'Tunis',
    },
    sameAs: [
      SITE.contact.facebook,
      SITE.contact.instagram,
      SITE.contact.tiktok,
    ],
  };

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Boutique Ahmed Mzali',
    url: 'https://ahmedmzaliboutique.tn',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: 'https://ahmedmzaliboutique.tn/shop?q={search_term_string}',
      },
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <html lang={lang} dir={dir}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        />
      </head>
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
