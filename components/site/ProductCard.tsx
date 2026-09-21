import Link from 'next/link';
import { getPrimaryProductImage, type Product } from '@/types';
import { formatPrice } from '@/lib/site-config';
import { getDictionary, type Lang } from '@/lib/i18n';

export default function ProductCard({ product, lang = 'fr' }: { product: Product; lang?: Lang }) {
  const t = getDictionary(lang);
  const primaryImage = getPrimaryProductImage(product.images);
  const img = primaryImage?.url;
  const discount = product.onSale && product.regularPrice > product.price
    ? Math.round(((product.regularPrice - product.price) / product.regularPrice) * 100)
    : 0;

  const soldOut = !product.inStock;

  return (
    <Link
      href={`/produit/${product.slug}`}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-card ${
        soldOut
          ? 'border-red-200 hover:border-red-300 opacity-90'
          : 'border-ink-200 hover:border-brand-300'
      }`}
      aria-label={soldOut ? `${product.name} — Épuisé` : product.name}
    >
      <div className="relative w-full bg-ink-100">
        <div style={{ paddingBottom: '125%' }} />
        {img && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={img}
            alt={primaryImage?.alt || product.name}
            className={`absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105 ${
              soldOut ? 'opacity-50 grayscale' : ''
            }`}
            loading="lazy"
          />
        )}

        {/* Discount badge */}
        {discount > 0 && !soldOut && (
          <span className="absolute left-2 top-2 rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-black text-white shadow">
            -{discount}%
          </span>
        )}

        {/* Out-of-stock badge — prominent red "ÉPUISÉ" */}
        {soldOut && (
          <span
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-red-600 px-3 py-1.5 text-[13px] font-black uppercase tracking-widest text-white shadow-lg"
            aria-hidden="true"
          >
            Épuisé
          </span>
        )}

        {/* Hover CTA — hidden when sold out */}
        {!soldOut && (
          <div className="absolute inset-x-2 bottom-2 translate-y-2 opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100">
            <span className="block w-full rounded-lg bg-cta py-2 text-center text-xs font-black text-white shadow-cta">
              {t.product.viewProduct}
            </span>
          </div>
        )}
        {soldOut && (
          <div className="absolute inset-x-2 bottom-2 translate-y-2 opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100">
            <span className="block w-full rounded-lg bg-red-600 py-2 text-center text-xs font-black text-white shadow">
              {t.product.viewProduct}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-bold text-ink-900">{product.name}</h3>
        <div className="mt-2 flex items-baseline gap-2">
          <span className={`text-base font-black md:text-lg ${soldOut ? 'text-ink-400 line-through' : 'text-brand-500'}`}>
            {formatPrice(product.price)}
          </span>
          {discount > 0 && !soldOut && (
            <span className="text-xs text-ink-300 line-through">{formatPrice(product.regularPrice)}</span>
          )}
          {soldOut && (
            <span className="rounded-md bg-red-100 px-2 py-0.5 text-[11px] font-black uppercase text-red-700">
              Épuisé
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
