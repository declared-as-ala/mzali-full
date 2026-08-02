import { buildProductFilter, buildProductSort } from './product-query';

describe('buildProductFilter', () => {
  it('forces published status on the public storefront path', () => {
    const filter = buildProductFilter({ status: 'draft' }, true);
    expect(filter.status).toBe('published');
    expect(filter.deletedAt).toBeNull();
  });

  it('honors an explicit status on the admin path', () => {
    const filter = buildProductFilter({ status: 'draft' }, false);
    expect(filter.status).toBe('draft');
  });

  it('leaves status unfiltered on admin when "any" or absent', () => {
    expect(buildProductFilter({ status: 'any' }, false).status).toBeUndefined();
    expect(buildProductFilter({}, false).status).toBeUndefined();
  });

  it('composes search/category/onSale/featured filters', () => {
    const filter = buildProductFilter(
      { search: 'robe', categorySlug: 'femme', onSale: true, featured: true },
      true,
    );
    expect(filter.$text).toEqual({ $search: 'robe' });
    expect(filter.categorySlugs).toBe('femme');
    expect(filter.salePriceMinor).toEqual({ $ne: null });
    expect(filter.featured).toBe(true);
  });

  it('filters by categoryId when provided', () => {
    const filter = buildProductFilter({ categoryId: '507f1f77bcf86cd799439011' }, true);
    expect(filter.categoryIds).toBe('507f1f77bcf86cd799439011');
  });
});

describe('buildProductSort', () => {
  it.each([
    ['date', 'createdAt'],
    ['price', 'regularPriceMinor'],
    ['popularity', 'totalSales'],
    ['rating', 'createdAt'],
    ['title', 'name'],
    ['menu_order', 'menuOrder'],
  ] as const)('maps orderBy=%s to field %s', (orderBy, field) => {
    const sort = buildProductSort({ orderBy });
    expect(Object.keys(sort)).toEqual([field]);
  });

  it('defaults to date desc when unspecified', () => {
    expect(buildProductSort({})).toEqual({ createdAt: -1 });
  });

  it('respects explicit asc/desc order', () => {
    expect(buildProductSort({ orderBy: 'price', order: 'asc' })).toEqual({ regularPriceMinor: 1 });
    expect(buildProductSort({ orderBy: 'price', order: 'desc' })).toEqual({ regularPriceMinor: -1 });
  });
});
