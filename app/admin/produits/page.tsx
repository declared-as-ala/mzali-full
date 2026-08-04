import { productService } from '@/services';
import ProduitsView from '@/components/admin/ProduitsView';

export const dynamic = 'force-dynamic';

export default async function Produits({ searchParams }: { searchParams?: { productId?: string } }) {
  const result = await productService.listAdmin({ perPage: 100, status: 'any', orderBy: 'menu_order', order: 'asc' }).catch(() => ({
    items: [], total: 0, totalPages: 0, page: 1,
  }));
  const products = result.items;
  const totals = {
    products: products.length,
    stock: products.reduce((sum, product) => sum + Math.max(product.stockQuantity ?? 0, 0), 0),
    untrackedStock: products.filter((product) => product.stockQuantity === null).length,
    outOfStock: products.filter((p) => !p.inStock).length,
    inventoryValue: products.reduce(
      (sum, product) => sum + Math.max(product.stockQuantity ?? 0, 0) * product.price,
      0,
    ),
  };
  return <ProduitsView initialProducts={products} totals={totals} initialEditingId={searchParams?.productId ?? null} />;
}
