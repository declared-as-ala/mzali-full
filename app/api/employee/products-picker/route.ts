import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { productService } from '@/services';
import { getPrimaryProductImage, type Product } from '@/types';

type CacheEntry = { at: number; data: unknown };
const pickerCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000; // 60 seconds

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || (session.role !== 'employee' && session.role !== 'admin')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const excludePosOnly = url.searchParams.get('excludePosOnly') === 'true';
  const statusParam = url.searchParams.get('status');
  const status = statusParam ?? (excludePosOnly ? 'published' : 'any');

  const cacheKey = `${status}:${excludePosOnly}`;
  const cached = pickerCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

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

  const result = items.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    image: getPrimaryProductImage(p.images)?.url ?? '',
    status: p.status,
    posOnly: Boolean(p.posOnly),
    // Live sellable stock (sum of active variants at DEPOT); null when stock is not tracked.
    stock: p.inventoryEnabled === false ? null : (p.variants ?? []).filter((v) => v.active).reduce((sum, v) => sum + (v.available ?? 0), 0),
  }));

  pickerCache.set(cacheKey, { at: Date.now(), data: result });
  return NextResponse.json(result);
}
