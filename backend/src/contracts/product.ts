// Normalized internal Product type — UI components depend on THIS, not on WooCommerce shapes.
// Mappers in /services/woo/* convert WooCommerce responses → Product.

export type ProductImage = {
  id: string;          // string so future custom backend can use UUIDs
  url: string;
  alt?: string;
  position?: number;
  isPrimary?: boolean;
};

export function getPrimaryProductImage<T extends object>(images: T[]): T | undefined {
  return images.find((image) => Boolean((image as { isPrimary?: boolean }).isPrimary)) ?? images[0];
}

export type ProductAttribute = {
  name: string;        // e.g. "Couleur"
  options: string[];   // e.g. ["Rouge", "Bleu"]
  variation: boolean;  // affects price/stock
};

export type ProductBundle = {
  id: string;
  name: string;
  label?: string;
  regularPrice: number;
  price: number;
  deliveryPrice: number;
  quantity: number;
  badgeColor: 'red' | 'green' | 'blue' | 'purple';
  imageUrl?: string;
  isDefault: boolean;
};

export type ProductStatus = 'published' | 'draft' | 'private';

export type Product = {
  id: string;
  slug: string;
  name: string;
  status: ProductStatus;
  description: string;
  shortDescription: string;
  price: number;          // current effective price
  regularPrice: number;
  salePrice: number | null;
  onSale: boolean;
  currency: string;       // ISO code, e.g. "TND"
  inStock: boolean;
  stockQuantity: number | null;
  images: ProductImage[];
  categoryIds: string[];
  categorySlugs: string[];
  attributes: ProductAttribute[];
  bundles: ProductBundle[];
  upsellIds: string[];
  crossSellIds: string[];
  supplierId: string | null;
  meta: Record<string, unknown>; // free-form extras (kept for WC carryover; future backend can drop it)
  /** Sold only at the till — never shown on the storefront and rejected if
   *  ordered through online checkout, but still sellable in the POS. */
  posOnly: boolean;
};

export type ProductListQuery = {
  page?: number;
  perPage?: number;
  search?: string;
  status?: string;
  categorySlug?: string;
  categoryId?: string;
  orderBy?: 'date' | 'price' | 'popularity' | 'rating' | 'title' | 'menu_order';
  order?: 'asc' | 'desc';
  onSale?: boolean;
  featured?: boolean;
};

export type ProductListResult = {
  items: Product[];
  total: number;
  totalPages: number;
  page: number;
};
