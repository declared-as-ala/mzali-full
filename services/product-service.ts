import type { Product, ProductBundle, ProductListQuery, ProductListResult } from '@/types';

export type ProductInput = {
  name: string;
  slug?: string;
  description?: string;
  shortDescription?: string;
  regularPrice?: number;
  salePrice?: number | null;
  sku?: string;
  manageStock?: boolean;
  stockQuantity?: number | null;
  status?: 'published' | 'draft' | 'private';
  categoryIds?: string[];
  imageIds?: string[];     // attachment ids (WP). Custom backend may use URLs/UUIDs.
  upsellIds?: string[];
  bundles?: ProductBundle[];
  options?: { label: string; type: 'text' | 'select' | 'radio'; values: string }[];
  cost?: number;
  deliveryPrice?: number;
  deliveryCost?: number;
  /** Sold only at the till — hidden from the storefront, still sellable in
   *  POS. mzali-api provider only; ignored by the WooCommerce provider. */
  posOnly?: boolean;
};

export interface ProductService {
  /** Storefront-facing reads only: published products, and (mzali-api
   *  provider) posOnly products excluded. Never use these for admin/employee
   *  screens — they'd see fewer products than actually exist. Use
   *  listAdmin/getByIdAdmin instead. */
  list(query?: ProductListQuery): Promise<ProductListResult>;
  getBySlug(slug: string): Promise<Product | null>;
  getById(id: string): Promise<Product | null>;
  getRelated(productId: string, limit?: number): Promise<Product[]>;
  /** Full, unfiltered reads for admin/employee screens — every status,
   *  including posOnly products. Requires an authenticated session
   *  (products.read permission; both admin and employee roles have it). */
  listAdmin(query?: ProductListQuery): Promise<ProductListResult>;
  getByIdAdmin(id: string): Promise<Product | null>;
  create(input: ProductInput): Promise<Product>;
  update(id: string, input: Partial<ProductInput>): Promise<Product>;
  remove(id: string): Promise<void>;
  reorder(items: { id: string; menuOrder: number }[]): Promise<void>;
}
