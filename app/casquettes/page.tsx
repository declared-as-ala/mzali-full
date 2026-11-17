import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import ProductCard from '@/components/site/ProductCard';
import { productService, categoryService } from '@/services';
import type { ProductListQuery } from '@/types';
import { getDictionary } from '@/lib/i18n';
import { getCurrentLang } from '@/lib/i18n-server';

export const revalidate = 60;

type Search = { [key: string]: string | string[] | undefined };

function param(s: Search, key: string): string | undefined {
  const v = s[key];
  return Array.isArray(v) ? v[0] : v;
}

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getCurrentLang();
  const isAr = lang === 'ar';
  const title = isAr
    ? 'كاسكيتات — بوتيك أحمد مزالي'
    : 'Casquettes — Boutique Ahmed Mzali';
  const description = isAr
    ? 'اكتشف مجموعتنا الحصرية من الكاسكيتات العصرية لدى بوتيك أحمد مزالي. توصيل سريع 24-48 ساعة في كامل تونس والدفع عند الاستلام.'
    : 'Découvrez notre collection exclusive de casquettes tendance chez Boutique Ahmed Mzali. Livraison rapide 24-48h partout en Tunisie, paiement à la livraison (COD).';
  const canonicalUrl = 'https://ahmedmzaliboutique.tn/casquettes';

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      type: 'website',
      url: canonicalUrl,
      title,
      description,
      siteName: 'Boutique Ahmed Mzali',
      images: [
        {
          url: 'https://ahmedmzaliboutique.tn/og-image.jpg',
          width: 1200,
          height: 630,
          alt: isAr ? 'كاسكيتات — بوتيك أحمد مزالي' : 'Casquettes — Boutique Ahmed Mzali',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['https://ahmedmzaliboutique.tn/og-image.jpg'],
    },
  };
}

export default async function CasquettesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const lang = await getCurrentLang();
  const t = getDictionary(lang);
  const sp = await searchParams;
  const page = Math.max(1, Number(param(sp, 'page') ?? 1));
  const sort = (param(sp, 'sort') ?? 'menu_order') as ProductListQuery['orderBy'];
  const order = (param(sp, 'order') ?? (sort === 'menu_order' ? 'asc' : 'desc')) as ProductListQuery['order'];

  const [result, categories] = await Promise.all([
    productService
      .list({
        categorySlug: 'casquettes',
        page,
        perPage: 24,
        orderBy: sort,
        order,
      })
      .catch(() => ({ items: [], total: 0, totalPages: 1, page })),
    categoryService.list({ hideEmpty: true }).catch(() => []),
  ]);

  const sortOptions: { value: NonNullable<ProductListQuery['orderBy']>; label: string }[] = [
    { value: 'menu_order', label: t.shop.sort.menuOrder },
    { value: 'date', label: t.shop.sort.date },
    { value: 'price', label: t.shop.sort.price },
    { value: 'popularity', label: t.shop.sort.popularity },
    { value: 'title', label: t.shop.sort.title },
  ];

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: t.nav.home,
        item: 'https://ahmedmzaliboutique.tn/',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: t.casquettes.title,
        item: 'https://ahmedmzaliboutique.tn/casquettes',
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <Header categories={categories.map((c) => ({ name: c.name, slug: c.slug }))} />

      <main className="container-shop py-6 sm:py-10">
        {/* Breadcrumb Navigation */}
        <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-xs font-medium text-ink-600">
          <Link href="/" className="hover:text-brand-600 transition-colors">
            {t.nav.home}
          </Link>
          <ChevronRight size={13} className="text-ink-400 rtl:rotate-180" />
          <span className="font-bold text-ink-900">{t.casquettes.title}</span>
        </nav>

        {/* Category Header & Sorting */}
        <header className="mb-6 sm:mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-ink-100 pb-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-brand-500">
              {t.casquettes.label}
            </p>
            <h1 className="mt-1 text-2xl sm:text-4xl font-black uppercase tracking-tight text-ink-900">
              {t.casquettes.title}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-ink-700">
              {t.common.articlesCount(result.total || result.items.length)}
            </p>
          </div>

          <form className="flex items-center gap-2">
            <select name="sort" defaultValue={sort} className="input w-40 sm:w-44 py-2 text-sm">
              {sortOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-primary py-2 px-4 text-sm">
              {t.shop.ok}
            </button>
          </form>
        </header>

        {/* Product Grid */}
        {result.items.length > 0 ? (
          <div className="grid grid-cols-3 gap-1.5 min-[375px]:gap-2 sm:gap-3.5 md:gap-4 lg:grid-cols-4 lg:gap-5">
            {result.items.map((p) => (
              <ProductCard key={p.id} product={p} lang={lang} />
            ))}
          </div>
        ) : (
          <div className="my-12 rounded-2xl border border-ink-200/80 bg-white p-10 text-center shadow-2xs">
            <p className="text-base font-bold text-ink-800">{t.casquettes.empty}</p>
            <p className="mt-1 text-xs sm:text-sm text-ink-600">{t.casquettes.subtitle}</p>
            <Link
              href="/"
              className="btn-primary mt-5 inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-bold"
            >
              {t.casquettes.backToHome}
            </Link>
          </div>
        )}

        {/* Pagination */}
        {result.totalPages > 1 && (
          <nav className="mt-10 flex items-center justify-center gap-2">
            {Array.from({ length: result.totalPages }).map((_, i) => {
              const n = i + 1;
              const active = n === page;
              return (
                <Link
                  key={n}
                  href={`/casquettes?page=${n}${sort ? `&sort=${sort}` : ''}`}
                  className={`grid h-10 min-w-[40px] place-items-center rounded-lg px-2 text-sm font-bold ${
                    active
                      ? 'bg-brand-500 text-white'
                      : 'border border-ink-200 bg-white text-ink-700 hover:bg-ink-100'
                  }`}
                >
                  {n}
                </Link>
              );
            })}
          </nav>
        )}
      </main>

      <Footer />
    </>
  );
}

