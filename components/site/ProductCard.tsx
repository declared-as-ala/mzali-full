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
      className={`group relative flex flex-col h-full overflow-hidden rounded-xl sm:rounded-2xl border bg-white shadow-2xs transition-all duration-200 hover:-translate-y-0.5 sm:hover:-translate-y-1 hover:shadow-card ${
        soldOut
          ? 'border-neutral-200/80 hover:border-neutral-300 opacity-90'
          : 'border-neutral-200/80 hover:border-brand-300'
      }`}
      aria-label={soldOut ? `${product.name} — ${t.product.outOfStock}` : product.name}
    >
      {/* Product Image Container — uncropped portrait aspect-[3/4] on neutral background */}
      <div className="relative w-full aspect-[3/4] overflow-hidden rounded-t-xl sm:rounded-t-2xl bg-[#f8f9fa] flex items-center justify-center shrink-0">
        {img ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={img}
            alt={primaryImage?.alt || product.name}
            className={`h-full w-full object-contain p-1 min-[375px]:p-1.5 sm:p-2.5 transition-transform duration-300 ease-out group-hover:scale-[1.03] ${
              soldOut ? 'opacity-40 grayscale' : ''
            }`}
            loading="lazy"
            decoding="async"
            width={360}
            height={480}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center p-2 text-center text-[10px] sm:text-xs text-neutral-400">
            {product.name}
          </div>
        )}

        {/* Compact discount badge in top corner (start-1.5 aligns top-left in LTR, top-right in RTL) */}
        {discount > 0 && !soldOut && (
          <span className="absolute start-1.5 top-1.5 sm:start-2 sm:top-2 rounded sm:rounded-md bg-red-600 px-1 min-[375px]:px-1.5 sm:px-2 py-0.5 text-[9px] min-[375px]:text-[10px] sm:text-[11px] font-black tracking-tight text-white shadow-xs z-10 leading-none">
            -{discount}%
          </span>
        )}

        {/* Out-of-stock badge */}
        {soldOut && (
          <span
            className="absolute start-1.5 top-1.5 sm:start-2 sm:top-2 rounded sm:rounded-md bg-neutral-900/85 backdrop-blur-xs px-1.5 sm:px-2 py-0.5 sm:py-1 text-[8px] min-[375px]:text-[9px] sm:text-[11px] font-black uppercase tracking-wider text-white shadow-xs z-10 leading-none"
            aria-hidden="true"
          >
            {t.product.outOfStock}
          </span>
        )}
      </div>

      {/* Product Card Details */}
      <div className="flex flex-1 flex-col justify-between p-1.5 min-[375px]:p-2 sm:p-3">
        <div>
          {/* Product Name — max 2 lines with ellipsis, ~11-12px on mobile */}
          <h3 className="line-clamp-2 text-[11px] min-[375px]:text-[12px] sm:text-sm font-bold text-neutral-800 group-hover:text-brand-600 transition-colors leading-[1.25] sm:leading-snug min-h-[1.75rem] min-[375px]:min-h-[1.9rem] sm:min-h-[2.4rem] break-words">
            {product.name}
          </h3>

          {/* Pricing — selling price ~12-14px bold, original price ~10-11px strikethrough */}
          <div className="mt-1 sm:mt-2 flex items-baseline gap-1 sm:gap-1.5 flex-wrap">
            <span
              className={`text-[12px] min-[375px]:text-[13px] sm:text-base font-black tracking-tight leading-none ${
                soldOut ? 'text-neutral-400 line-through' : 'text-ink-900'
              }`}
            >
              {formatPrice(product.price)}
            </span>
            {discount > 0 && !soldOut && (
              <span className="text-[9.5px] min-[375px]:text-[10.5px] sm:text-xs text-neutral-400 line-through font-medium leading-none">
                {formatPrice(product.regularPrice)}
              </span>
            )}
            {soldOut && (
              <span className="rounded bg-neutral-100 px-1 py-0.5 text-[8px] min-[375px]:text-[9px] sm:text-[10px] font-bold uppercase text-neutral-600 leading-none">
                {t.product.outOfStock}
              </span>
            )}
          </div>
        </div>

        {/* Subtle desktop interactive hint */}
        <div className="mt-2.5 hidden sm:flex items-center justify-between pt-2 border-t border-neutral-100 text-xs font-bold text-brand-600 group-hover:text-brand-700">
          <span>{t.product.viewProduct}</span>
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-brand-600 transition-transform duration-200 group-hover:translate-x-1 rtl:group-hover:-translate-x-1 group-hover:bg-brand-500 group-hover:text-white">
            <ArrowRight size={13} className="rtl:rotate-180" />
          </span>
        </div>
      </div>
    </Link>
  );
}
