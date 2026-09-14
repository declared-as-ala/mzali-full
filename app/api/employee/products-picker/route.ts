import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { productService } from '@/services';
import { getPrimaryProductImage, type Product } from '@/types';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || (session.role !== 'employee' && session.role !== 'admin')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const excludePosOnly = url.searchParams.get('excludePosOnly') === 'true';
  const statusParam = url.searchParams.get('status');
  const status = statusParam ?? (excludePosOnly ? 'published' : 'any');

  const res = await productService.listAdmin({
    perPage: 100,
    status,
    excludePosOnly,
    orderBy: 'title',
    order: 'asc',
  });

  let allItems: Product[] = res.items;
  if (res.totalPages > 1) {
    const promises: Promise<Product[]>[] = [];
    for (let p = 2; p <= res.totalPages; p++) {
      promises.push(
        productService
          .listAdmin({
            page: p,
            perPage: 100,
            status,
            excludePosOnly,
            orderBy: 'title',
            order: 'asc',
          })
          .then((r) => r.items)
          .catch(() => [] as Product[]),
      );
    }
    const additionalPages = await Promise.all(promises);
    allItems = allItems.concat(additionalPages.flat());
  }

  let items = allItems;
  if (status && status !== 'any') {
    items = items.filter((p) => p.status === status);
  }
  if (excludePosOnly) {
    items = items.filter((p) => !p.posOnly);
  }

  return NextResponse.json(
    items.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      image: getPrimaryProductImage(p.images)?.url ?? '',
      status: p.status,
      posOnly: Boolean(p.posOnly),
    })),
  );
}
