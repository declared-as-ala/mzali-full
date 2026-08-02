import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest } from '@/services/mzali-api/client';
import StockView from '@/components/admin/StockView';
import type { InventoryItem } from '@/types/inventory';

export const dynamic = 'force-dynamic';

const PROVIDER = process.env.COMMERCE_PROVIDER ?? 'woocommerce';

export default async function StockPage({ searchParams }: { searchParams?: { lowStock?: string; productId?: string } }) {
  if (PROVIDER !== 'mzali-api') {
    return (
      <div className="p-8">
        <h1 className="mb-4 text-3xl font-black">Stock</h1>
        <p className="rounded-xl bg-amber-50 p-4 text-amber-800">
          La gestion de stock nécessite le backend Mzali API (COMMERCE_PROVIDER=mzali-api).
        </p>
      </div>
    );
  }
  const bearer = await getValidAccessToken();
  const data = bearer
    ? await apiRequest<{ items: InventoryItem[]; total: number }>('/admin/inventory', { bearer, query: { perPage: 100 } }).catch(() => ({ items: [], total: 0 }))
    : { items: [], total: 0 };
  return <StockView initial={data.items} initialLowStockOnly={searchParams?.lowStock === 'true'} highlightedProductId={searchParams?.productId ?? null} />;
}
