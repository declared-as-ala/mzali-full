import { FilterQuery, SortOrder } from 'mongoose';
import type { ProductListQuery } from '@contracts';
import { Product } from './product.schema';

const ORDERBY_FIELD: Record<string, keyof Product | '_score'> = {
  date: 'createdAt',
  price: 'regularPriceMinor',
  popularity: 'totalSales',
  // 'rating' has no backing field (reviews are deferred) — fall back to date,
  // same graceful degradation the storefront already tolerates.
  rating: 'createdAt',
  title: 'name',
  menu_order: 'menuOrder',
};

export function buildProductFilter(query: ProductListQuery, forcePublished: boolean, excludePosOnly = false): FilterQuery<Product> {
  const filter: FilterQuery<Product> = { deletedAt: null };
  if (forcePublished) {
    filter.status = 'published';
  } else if (query.status && query.status !== 'any') {
    filter.status = query.status;
  }
  if (excludePosOnly) filter.posOnly = { $ne: true };
  if (query.search) filter.$text = { $search: query.search };
  if (query.categorySlug) filter.categorySlugs = query.categorySlug;
  if (query.categoryId) filter.categoryIds = query.categoryId;
  if (query.onSale) filter.salePriceMinor = { $ne: null };
  if (query.featured) filter.featured = true;
  return filter;
}

export function buildProductSort(query: ProductListQuery): Record<string, SortOrder> {
  const field = ORDERBY_FIELD[query.orderBy ?? 'date'] ?? 'createdAt';
  const direction: SortOrder = query.order === 'asc' ? 1 : -1;
  return { [field]: direction };
}
