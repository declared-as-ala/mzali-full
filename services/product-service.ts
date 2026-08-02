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
};

export interface ProductService {
  list(query?: ProductListQuery): Promise<ProductListResult>;
  getBySlug(slug: string): Promise<Product | null>;
  getById(id: string): Promise<Product | null>;
  getRelated(productId: string, limit?: number): Promise<Product[]>;
  create(input: ProductInput): Promise<Product>;
  update(id: string, input: Partial<ProductInput>): Promise<Product>;
  remove(id: string): Promise<void>;
  reorder(items: { id: string; menuOrder: number }[]): Promise<void>;
}
