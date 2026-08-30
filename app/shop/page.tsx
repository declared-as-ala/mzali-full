import type { Metadata } from 'next';
import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import ProductCard from '@/components/site/ProductCard';
import { productService, categoryService } from '@/services';
import type { ProductListQuery } from '@/types';
import Link from 'next/link';
import { getDictionary } from '@/lib/i18n';
import { getCurrentLang } from '@/lib/i18n-server';

export const revalidate = 60;

type Search = { [key: string]: string | string[] | undefined };

function param(s: Search, key: string): string | undefined {
  const v = s[key];
  return Array.isArray(v) ? v[0] : v;
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<Search> }): Promise<Metadata> {
  const sp = await searchParams;
  const search = param(sp, 'q');

  const title = search
    ? `Recherche : « ${search} » — Boutique Ahmed Mzali`
    : 'Boutique & Catalogue — Prêt-à-porter & Chaussures';
  const description = 'Découvrez l’ensemble de nos collections de vêtements, chaussures et accessoires chez Boutique Ahmed Mzali. Livraison 24-48h partout en Tunisie, paiement à la livraison.';
  const canonicalUrl = 'https://ahmedmzaliboutique.tn/shop';

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      type: 'website',
      url: canonicalUrl,
      title: `${title} — Boutique Ahmed Mzali`,
      description,
      siteName: 'Boutique Ahmed Mzali',
      images: [
        {
          url: 'https://ahmedmzaliboutique.tn/og-image.jpg',
          width: 1200,
          height: 630,
          alt: 'Catalogue Boutique Ahmed Mzali',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} — Boutique Ahmed Mzali`,
      description,
      images: ['https://ahmedmzaliboutique.tn/og-image.jpg'],
    },
  };
}

export default async function ShopPage({ searchParams }: { searchParams: Promise<Search> }) {
  const lang = await getCurrentLang();
  const t = getDictionary(lang);
  const sp = await searchParams;
  const page = Math.max(1, Number(param(sp, 'page') ?? 1));
  const sort = (param(sp, 'sort') ?? 'menu_order') as ProductListQuery['orderBy'];
  const order = (param(sp, 'order') ?? (sort === 'menu_order' ? 'asc' : 'desc')) as ProductListQuery['order'];
  const search = param(sp, 'q');

  const [result, categories] = await Promise.all([
    productService.list({ page, perPage: 24, orderBy: sort, order, search }).catch(() => ({ items: [], total: 0, totalPages: 1, page })),
    categoryService.list({ hideEmpty: true }).catch(() => []),
  ]);

  const sortOptions: { value: NonNullable<ProductListQuery['orderBy']>; label: string }[] = [
    { value: 'menu_order', label: t.shop.sort.menuOrder },
    { value: 'date', label: t.shop.sort.date },
    { value: 'price', label: t.shop.sort.price },
    { value: 'popularity', label: t.shop.sort.popularity },
    { value: 'title', label: t.shop.sort.title },
  ];

  return (
    <>
      <Header categories={categories.map((c) => ({ name: c.name, slug: c.slug }))} />

      <main className="container-shop py-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tight text-ink-900">
              {search ? t.shop.searchTitle(search) : t.shop.title}
            </h1>
            <p className="text-sm text-ink-700">{t.common.productsCount(result.total)}</p>
          </div>
          <form className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              name="q"
              defaultValue={search}
              placeholder={t.shop.placeholder}
              className="input w-56"
            />
            <select name="sort" defaultValue={sort} className="input w-40">
              {sortOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button className="btn-primary">{t.shop.ok}</button>
          </form>
        </header>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {result.items.map((p) => <ProductCard key={p.id} product={p} lang={lang} />)}
        </div>

        {result.totalPages > 1 && (
          <nav className="mt-10 flex items-center justify-center gap-2">
            {Array.from({ length: result.totalPages }).map((_, i) => {
              const n = i + 1;
              const active = n === page;
              return (
                <Link
                  key={n}
                  href={`/shop?page=${n}${sort ? `&sort=${sort}` : ''}${search ? `&q=${encodeURIComponent(search)}` : ''}`}
                  className={`grid h-10 min-w-[40px] place-items-center rounded-lg px-2 text-sm font-bold ${active ? 'bg-brand-500 text-white' : 'border border-ink-200 bg-white text-ink-700 hover:bg-ink-100'}`}
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
