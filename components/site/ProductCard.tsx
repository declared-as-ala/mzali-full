import Link from 'next/link';
import type { Product } from '@/types';
import { formatPrice } from '@/lib/site-config';
import { getDictionary, type Lang } from '@/lib/i18n';

export default function ProductCard({ product, lang = 'fr' }: { product: Product; lang?: Lang }) {
  const t = getDictionary(lang);
  const img = product.images[0]?.url;
  const discount = product.onSale && product.regularPrice > product.price
    ? Math.round(((product.regularPrice - product.price) / product.regularPrice) * 100)
    : 0;

  return (
    <Link
      href={`/produit/${product.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm transition hover:-translate-y-1 hover:border-brand-300 hover:shadow-card"
    >
      <div className="relative w-full bg-ink-100">
        <div style={{ paddingBottom: '125%' }} />
        {img && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={img}
            alt={product.images[0]?.alt || product.name}
            className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105"
            loading="lazy"
          />
        )}
        {discount > 0 && (
          <span className="absolute left-2 top-2 rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-black text-white shadow">
            -{discount}%
          </span>
        )}
        {!product.inStock && (
          <span className="absolute right-2 top-2 rounded-md bg-ink-900/85 px-2 py-0.5 text-[11px] font-bold text-white">
            {t.product.outOfStock}
          </span>
        )}

        <div className="absolute inset-x-2 bottom-2 translate-y-2 opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100">
          <span className="block w-full rounded-lg bg-cta py-2 text-center text-xs font-black text-white shadow-cta">
            {t.product.viewProduct}
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-3">
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-bold text-ink-900">{product.name}</h3>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-base font-black text-brand-500 md:text-lg">{formatPrice(product.price)}</span>
          {discount > 0 && (
            <span className="text-xs text-ink-300 line-through">{formatPrice(product.regularPrice)}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
