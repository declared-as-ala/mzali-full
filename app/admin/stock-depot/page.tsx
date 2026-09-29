import { redirect } from 'next/navigation';

/** The Dépôt/Boutique split is gone: there is one Stock page. */
export default async function Page({ searchParams }: { searchParams: Promise<{ productId?: string }> }) {
  const { productId } = await searchParams;
  redirect(`/admin/stock${productId ? `?productId=${encodeURIComponent(productId)}` : ''}`);
}
