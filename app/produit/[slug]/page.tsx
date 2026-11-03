import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import AddToCart from '@/components/site/AddToCart';
import ProductCard from '@/components/site/ProductCard';
import ProductGallery from '@/components/site/ProductGallery';
import { productService, categoryService } from '@/services';
import { formatPrice } from '@/lib/site-config';
import { getDictionary } from '@/lib/i18n';
import { getCurrentLang } from '@/lib/i18n-server';

export const revalidate = 60;

function stripHtml(html?: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
}

function resolveImageUrl(src?: string): string {
  if (!src) return 'https://ahmedmzaliboutique.tn/og-image.jpg';
  if (src.startsWith('http://') || src.startsWith('https://')) return src;
  return `https://ahmedmzaliboutique.tn${src.startsWith('/') ? '' : '/'}${src}`;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await productService.getBySlug(slug).catch(() => null);

  if (!product) {
    return {
      title: 'Produit introuvable',
      description: 'Ce produit n’est plus disponible dans notre boutique.',
    };
  }

  const rawDescription = stripHtml(product.shortDescription || product.description);
  const description = rawDescription.length > 10
    ? (rawDescription.length > 160 ? `${rawDescription.slice(0, 157)}...` : rawDescription)
    : `${product.name} disponible chez Boutique Ahmed Mzali à ${product.price} DT. Livraison express 24-48h partout en Tunisie, paiement à la livraison.`;

  const primaryImage = product.images?.find((img) => img.isPrimary) ?? product.images?.[0];
  const imageUrl = resolveImageUrl(primaryImage?.url);

  const canonicalUrl = `https://ahmedmzaliboutique.tn/produit/${encodeURIComponent(product.slug)}`;

  return {
    title: product.name,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      type: 'article',
      url: canonicalUrl,
      title: `${product.name} — Boutique Ahmed Mzali`,
      description,
      siteName: 'Boutique Ahmed Mzali',
      images: [
        {
          url: imageUrl,
          width: 800,
          height: 800,
          alt: primaryImage?.alt || product.name,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${product.name} — Boutique Ahmed Mzali`,
      description,
      images: [imageUrl],
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const lang = await getCurrentLang();
  const t = getDictionary(lang);
  const { slug } = await params;
  const product = await productService.getBySlug(slug);
  if (!product) notFound();

  const [categories, related] = await Promise.all([
    categoryService.list({ hideEmpty: true }).catch(() => []),
    productService.getRelated(product.id, 4).catch(() => []),
  ]);

  const discount = product.onSale && product.regularPrice > product.price
    ? Math.round(((product.regularPrice - product.price) / product.regularPrice) * 100)
    : 0;

  const currentCategory = categories.find((c) => product.categoryIds.includes(c.id));
  const categoryName = currentCategory?.name ?? t.product.product;

  const rawDescription = stripHtml(product.shortDescription || product.description);
  const plainDescription = rawDescription || `${product.name} - Boutique Ahmed Mzali Tunisie`;

  const productImages = product.images?.length
    ? product.images.map((img) => resolveImageUrl(img.url))
    : ['https://ahmedmzaliboutique.tn/og-image.jpg'];

  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: productImages,
    description: plainDescription,
    sku: product.id,
    brand: {
      '@type': 'Brand',
      name: 'Boutique Ahmed Mzali',
    },
    offers: {
      '@type': 'Offer',
      url: `https://ahmedmzaliboutique.tn/produit/${encodeURIComponent(product.slug)}`,
      priceCurrency: 'TND',
      price: product.price,
      priceValidUntil: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().split('T')[0],
      itemCondition: 'https://schema.org/NewCondition',
      availability: product.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      seller: {
        '@type': 'Organization',
        name: 'Boutique Ahmed Mzali',
        url: 'https://ahmedmzaliboutique.tn',
      },
    },
  };

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
      ...(currentCategory
        ? [
            {
              '@type': 'ListItem',
              position: 3,
              name: currentCategory.name,
              item: `https://ahmedmzaliboutique.tn/categorie/${encodeURIComponent(currentCategory.slug)}`,
            },
            {
              '@type': 'ListItem',
              position: 4,
              name: product.name,
              item: `https://ahmedmzaliboutique.tn/produit/${encodeURIComponent(product.slug)}`,
            },
          ]
        : [
            {
              '@type': 'ListItem',
              position: 3,
              name: product.name,
              item: `https://ahmedmzaliboutique.tn/produit/${encodeURIComponent(product.slug)}`,
            },
          ]),
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

      <Header categories={categories.map((c) => ({ name: c.name, slug: c.slug }))} />

      <main className="container-shop py-4 sm:py-6 lg:py-10">
        <div className="grid gap-0 sm:gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="-mx-4 sm:mx-0">
            <ProductGallery images={product.images} productName={product.name} discount={discount} />
          </div>

          <div className="flex flex-col -mt-5 sm:mt-0 rounded-t-[32px] sm:rounded-none bg-white p-5 sm:p-0 shadow-lg sm:shadow-none relative z-10">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-widest text-brand-600">
                {categoryName}
              </span>
              {product.inStock ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200/60">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  En stock
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-700 border border-red-200/60">
                  Épuisé
                </span>
              )}
            </div>

            <h1 className="mt-2 text-2xl font-black text-neutral-900 sm:text-3xl md:text-4xl leading-tight">
              {product.name}
            </h1>

            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-2xl sm:text-3xl font-black text-brand-600">{formatPrice(product.price)}</span>
              {discount > 0 && (
                <>
                  <span className="text-base sm:text-lg text-neutral-400 line-through font-medium">
                    {formatPrice(product.regularPrice)}
                  </span>
                  <span className="rounded-lg bg-red-600 px-2 py-0.5 text-xs font-black text-white shadow-2xs">
                    -{discount}%
                  </span>
                </>
              )}
            </div>

            {product.shortDescription && (
              <div
                className="prose prose-sm mt-5 max-w-none text-neutral-600"
                dangerouslySetInnerHTML={{ __html: product.shortDescription }}
              />
            )}

            <AddToCart product={product} />

            {product.description && (
              <details className="mt-8 rounded-2xl bg-white p-5 shadow-xs border border-neutral-200/80">
                <summary className="cursor-pointer font-extrabold text-neutral-900 select-none">{t.product.fullDescription}</summary>
                <div
                  className="prose prose-sm mt-3 max-w-none text-neutral-600"
                  dangerouslySetInnerHTML={{ __html: product.description }}
                />
              </details>
            )}
          </div>
        </div>

        {related.length > 0 && (
          <section className="mt-14 sm:mt-16">
            <h2 className="mb-5 text-xl sm:text-2xl font-black uppercase tracking-tight text-neutral-900">
              {t.product.related}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
              {related.map((p) => <ProductCard key={p.id} product={p} lang={lang} />)}
            </div>
          </section>
        )}
      </main>

      <Footer />
    </>
  );
}
