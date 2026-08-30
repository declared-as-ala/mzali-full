import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import ProductCard from '@/components/site/ProductCard';
import { productService, categoryService } from '@/services';
import { getDictionary } from '@/lib/i18n';
import { getCurrentLang } from '@/lib/i18n-server';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const cat = await categoryService.getBySlug(slug).catch(() => null);

  if (!cat) {
    return {
      title: 'Catégorie introuvable',
      description: 'Cette catégorie n’existe pas ou a été déplacée.',
    };
  }

  const title = `${cat.name} — Boutique Ahmed Mzali`;
  const description = cat.description?.replace(/<[^>]*>?/gm, '').trim() ||
    `Découvrez tous les articles de la catégorie ${cat.name} chez Boutique Ahmed Mzali. Livraison rapide 24-48h partout en Tunisie, paiement à la livraison.`;
  const canonicalUrl = `https://ahmedmzaliboutique.tn/categorie/${encodeURIComponent(cat.slug)}`;

  return {
    title: cat.name,
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
          alt: cat.name,
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

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const lang = await getCurrentLang();
  const t = getDictionary(lang);
  const { slug } = await params;
  const [cat, categories] = await Promise.all([
    categoryService.getBySlug(slug),
    categoryService.list({ hideEmpty: true }),
  ]);
  if (!cat) notFound();

  const result = await productService.list({ categoryId: cat.id, perPage: 48, orderBy: 'menu_order', order: 'asc' }).catch(() => ({
    items: [], total: 0, totalPages: 0, page: 1,
  }));

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
        name: t.shop.title,
        item: 'https://ahmedmzaliboutique.tn/shop',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: cat.name,
        item: `https://ahmedmzaliboutique.tn/categorie/${encodeURIComponent(cat.slug)}`,
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
      <main className="container-shop py-10">
        <header className="mb-8">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-500">{t.category.label}</p>
          <h1 className="mt-2 text-4xl font-black text-ink-900">{cat.name}</h1>
          <p className="mt-1 text-ink-700">{t.common.articlesCount(result.total || result.items.length)}</p>
          {cat.description && (
            <div className="prose prose-sm mt-4 max-w-none text-ink-700" dangerouslySetInnerHTML={{ __html: cat.description }} />
          )}
        </header>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {result.items.map((p) => <ProductCard key={p.id} product={p} lang={lang} />)}
        </div>
        {!result.items.length && (
          <p className="py-20 text-center text-ink-700">{t.category.empty}</p>
        )}
      </main>
      <Footer />
    </>
  );
}
