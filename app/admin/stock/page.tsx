import StockOverview from '@/components/admin/StockOverview';

/** Admin -> Stock. One inventory (DEPOT). `?productId=` deep-links from the product editor. */
export default async function StockPage({ searchParams }: { searchParams: Promise<{ productId?: string }> }) {
  const { productId } = await searchParams;
  return <StockOverview initialProductId={/^[a-f0-9]{24}$/i.test(productId ?? '') ? productId : ''} />;
}
