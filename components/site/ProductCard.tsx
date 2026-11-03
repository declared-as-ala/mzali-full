import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
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
      prefetch={true}
      href={`/produit/${product.slug}`}
      className={`group relative flex flex-col h-full overflow-hidden rounded-2xl border bg-white shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-card ${
        soldOut
          ? 'border-neutral-200/80 hover:border-neutral-300 opacity-90'
          : 'border-neutral-200/80 hover:border-brand-300'
      }`}
      aria-label={soldOut ? `${product.name} — Épuisé` : product.name}
    >
      {/* Product Image Container — uncropped object-contain on neutral background */}
      <div className="relative w-full aspect-[3/4] overflow-hidden rounded-t-2xl bg-[#f8f9fa] flex items-center justify-center">
        {img ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={img}
            alt={primaryImage?.alt || product.name}
            className={`h-full w-full object-contain p-2 sm:p-2.5 transition-transform duration-500 ease-out group-hover:scale-[1.03] ${
              soldOut ? 'opacity-40 grayscale' : ''
            }`}
            loading="lazy"
            decoding="async"
            width={360}
            height={480}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-xs text-neutral-400">
            {product.name}
          </div>
        )}

        {/* Discount badge — positioned neatly in top-left */}
        {discount > 0 && !soldOut && (
          <span className="absolute left-2.5 top-2.5 rounded-lg bg-red-600 px-2 py-0.5 text-[11px] font-black tracking-wide text-white shadow-sm z-10">
            -{discount}%
          </span>
        )}

        {/* Out-of-stock badge */}
        {soldOut && (
          <span
            className="absolute left-2.5 top-2.5 rounded-lg bg-neutral-900/85 backdrop-blur-xs px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-white shadow-sm z-10"
            aria-hidden="true"
          >
            Épuisé
          </span>
        )}
      </div>

      {/* Product Card Details */}
      <div className="flex flex-1 flex-col justify-between p-3 sm:p-3.5">
        <div>
          <h3 className="line-clamp-2 text-xs sm:text-sm font-bold text-neutral-800 group-hover:text-brand-600 transition-colors leading-snug min-h-[2.3rem] sm:min-h-[2.6rem]">
            {product.name}
          </h3>

          <div className="mt-2 flex items-baseline gap-2 flex-wrap">
            <span className={`text-sm sm:text-base font-black md:text-lg ${soldOut ? 'text-neutral-400 line-through' : 'text-ink-900'}`}>
              {formatPrice(product.price)}
            </span>
            {discount > 0 && !soldOut && (
              <span className="text-xs text-neutral-400 line-through font-medium">
                {formatPrice(product.regularPrice)}
              </span>
            )}
            {soldOut && (
              <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-neutral-600">
                Épuisé
              </span>
            )}
          </div>
        </div>

        {/* Subtle desktop interactive hint — no heavy green overlay */}
        <div className="mt-2.5 hidden sm:flex items-center justify-between pt-2 border-t border-neutral-100 text-xs font-bold text-brand-600 group-hover:text-brand-700">
          <span>{t.product.viewProduct}</span>
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-brand-600 transition-transform duration-200 group-hover:translate-x-1 group-hover:bg-brand-500 group-hover:text-white">
            <ArrowRight size={13} />
          </span>
        </div>
      </div>
    </Link>
  );
}
