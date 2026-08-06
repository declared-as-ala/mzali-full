// Real data extracted from boutiqueahmedmzali.com (Converty template-3 storefront)
export const SITE = {
  name: 'Boutique Ahmed Mzali',
  domain: 'boutiqueahmedmzali.com',
  logo: '/hero.webp',
  /** Remote CDN fallback in case you want to reference the original instead. */
  logoRemote: 'https://cdn.converty.shop/images/25fcc422d849332b0a50da9fded0c6b4f3233d728efb1c62aeeffd0edde26cb5_md.webp',
  announcementBar: 'BIENVENUE A BOUTIQUE AHMED MZALI',
  hero: {
    title: 'livraison sur toute la tunisie ❤️',
    subtitle: 'Découvrez notre nouvelle collection',
  },
  categoriesTitle: 'produit',
  productsTitle: 'livraison sur toute la tunisie ❤️',
  cta: {
    text: 'اشتري الان',
    color: '#22bf59',
    textColor: '#ffffff',
  },
  contact: {
    email: 'mzaliahmed73@gmail.com',
    phone: '22479443',
    whatsapp: '22479443',
    facebook: 'https://www.facebook.com/share/1GFU7WuHMb/',
    instagram: 'https://www.instagram.com/ahmed_mzali_boutique',
    tiktok: 'https://www.tiktok.com/@ahmed.mzali.boutique007',
  },
  currency: {
    code: 'TND',
    symbol: 'DT',
    decimals: 0,
  },
  cities: [
    'Ariana', 'Beja', 'Ben Arous', 'Bizerte', 'Gabes', 'Gafsa',
    'Jendouba', 'Kasserine', 'Kef', 'Mahdia', 'Manouba', 'Monastir',
    'Nabeul', 'Sfax', 'Sidi Bouzid', 'Sousse', 'Siliana', 'Tataouine',
    'Tozeur', 'Tunis', 'Zaghouan', 'Medenine', 'Kebili', 'Kairouan',
  ],
  thankYouMessage: 'مرحبا بك خلي تلفونك ديما محلول انشاالله دقائق ونكلموك',
} as const;

export function formatPrice(v: number): string {
  return `${Math.round(v)} ${SITE.currency.symbol}`;
}

// Every admin/employee list is a 'use client' component, so Next.js renders
// it once on the server (initial HTML) and again on the client (hydration).
// A bare toLocaleDateString('fr-FR')/toLocaleString('fr-FR') formats in
// whatever timezone the *running* environment happens to be in — the server
// container is typically UTC, the browser is the visitor's local time — so
// the two renders can produce different text for the same Date and React
// reports it as a hydration mismatch (errors #418/#423/#425). Pinning an
// explicit timeZone makes both renders byte-identical regardless of where
// either one runs.
const TZ = 'Africa/Tunis';

export function formatDate(value: string | number | Date): string {
  return new Date(value).toLocaleDateString('fr-FR', { timeZone: TZ });
}

export function formatDateTime(value: string | number | Date): string {
  return new Date(value).toLocaleString('fr-FR', { timeZone: TZ });
}
