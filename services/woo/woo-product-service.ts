import type { Product, ProductListQuery, ProductListResult } from '@/types';
import type { ProductInput, ProductService } from '../product-service';
import { wooClient } from './woo-client';
import type { WooProductRaw } from './woo-types';
import { mapProduct } from './woo-mappers';

const ORDERBY_MAP: Record<NonNullable<ProductListQuery['orderBy']>, string> = {
  date: 'date',
  price: 'price',
  popularity: 'popularity',
  rating: 'rating',
  title: 'title',
  menu_order: 'menu_order',
};

function toWoo(input: Partial<ProductInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.name !== undefined) out.name = input.name;
  if (input.slug !== undefined) out.slug = input.slug;
  if (input.description !== undefined) out.description = input.description;
  if (input.shortDescription !== undefined) out.short_description = input.shortDescription;
  if (input.regularPrice !== undefined) out.regular_price = String(input.regularPrice);
  if (input.salePrice !== undefined && input.salePrice !== null) out.sale_price = String(input.salePrice);
  if (input.sku !== undefined) out.sku = input.sku;
  if (input.manageStock !== undefined) out.manage_stock = input.manageStock;
  if (input.stockQuantity !== undefined && input.stockQuantity !== null) out.stock_quantity = input.stockQuantity;
  if (input.status) {
    out.status = input.status === 'published' ? 'publish' : input.status;
  }
  if (input.categoryIds) out.categories = input.categoryIds.map((id) => ({ id: Number(id) }));
  if (input.imageIds) out.images = input.imageIds.map((id) => ({ id: Number(id) }));
  if (input.upsellIds) out.upsell_ids = input.upsellIds.map(Number);

  const meta: { key: string; value: unknown }[] = [];
  if (input.bundles) meta.push({ key: '_mzem_bundles', value: input.bundles });
  if (input.options) meta.push({ key: '_mzem_options', value: input.options });
  if (input.cost !== undefined) meta.push({ key: '_mzem_cost', value: String(input.cost) });
  if (input.deliveryPrice !== undefined) meta.push({ key: '_mzem_delivery_price', value: String(input.deliveryPrice) });
  if (input.deliveryCost !== undefined) meta.push({ key: '_mzem_delivery_cost', value: String(input.deliveryCost) });
  if (meta.length) out.meta_data = meta;

  return out;
}

export class WooCommerceProductService implements ProductService {
  async list(query: ProductListQuery = {}): Promise<ProductListResult> {
    const status = query.status === 'published' ? 'publish' : (query.status ?? 'publish');
    const wcQuery: Record<string, string | number | boolean | undefined> = {
      per_page: query.perPage ?? 24,
      page: query.page ?? 1,
      status,
      search: query.search || undefined,
      category: query.categoryId || undefined,
      orderby: query.orderBy ? ORDERBY_MAP[query.orderBy] : 'date',
      order: query.order ?? 'desc',
      on_sale: query.onSale || undefined,
      featured: query.featured || undefined,
    };
    if (!wcQuery.category && query.categorySlug) {
      try {
        const cats = await wooClient.get<{ id: number; slug: string }[]>('/products/categories', { slug: query.categorySlug, per_page: 1 });
        wcQuery.category = cats.data[0]?.id;
      } catch {}
    }
    const res = await wooClient.get<WooProductRaw[]>('/products', wcQuery);
    return { items: res.data.map(mapProduct), total: res.total, totalPages: res.totalPages, page: query.page ?? 1 };
  }

  async getBySlug(slug: string): Promise<Product | null> {
    const res = await wooClient.get<WooProductRaw[]>('/products', { slug, per_page: 1 });
    return res.data[0] ? mapProduct(res.data[0]) : null;
  }

  async getById(id: string): Promise<Product | null> {
    try {
      const res = await wooClient.get<WooProductRaw>(`/products/${id}`);
      return res.data ? mapProduct(res.data) : null;
    } catch {
      return null;
    }
  }

  async getRelated(productId: string, limit = 4): Promise<Product[]> {
    const product = await this.getById(productId);
    if (!product) return [];
    if (product.upsellIds.length) {
      const res = await wooClient.get<WooProductRaw[]>('/products', { include: product.upsellIds.join(','), per_page: limit });
      return res.data.map(mapProduct);
    }
    if (product.categoryIds[0]) {
      const res = await wooClient.get<WooProductRaw[]>('/products', { category: product.categoryIds[0], per_page: limit + 1, exclude: productId });
      return res.data.map(mapProduct).slice(0, limit);
    }
    return [];
  }

  async create(input: ProductInput): Promise<Product> {
    const res = await wooClient.post<WooProductRaw>('/products', toWoo(input));
    return mapProduct(res.data);
  }

  async update(id: string, input: Partial<ProductInput>): Promise<Product> {
    const res = await wooClient.put<WooProductRaw>(`/products/${id}`, toWoo(input));
    return mapProduct(res.data);
  }

  async remove(id: string): Promise<void> {
    await wooClient.del(`/products/${id}`);
  }

  async reorder(items: { id: string; menuOrder: number }[]): Promise<void> {
    await wooClient.post('/products/batch', {
      update: items.map((x) => ({
        id: Number(x.id),
        menu_order: x.menuOrder,
      })),
    });
  }
}
