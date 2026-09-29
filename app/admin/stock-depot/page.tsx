import VariantStockView from '@/components/admin/VariantStockView';

/** `?productId=` deep-links here from the product editor's "Gerer les stocks" link. */
export default async function Page({ searchParams }: { searchParams: Promise<{ productId?: string }> }) {
  const { productId } = await searchParams;
  return <VariantStockView locationId="DEPOT" initialProductId={/^[a-f0-9]{24}$/i.test(productId ?? '') ? productId : ''} />;
}
