import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { orderService } from '@/services';
import { apiRequest } from '@/services/mzali-api/client';
import { getValidAccessToken } from '@/lib/api-auth';
import type { OrderResponse } from '@/types';

const PROVIDER = process.env.COMMERCE_PROVIDER ?? 'woocommerce';

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const phone = url.searchParams.get('phone')?.trim();
  if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 });

  let matches: OrderResponse[];
  if (PROVIDER === 'mzali-api') {
    const bearer = await getValidAccessToken();
    if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    matches = await apiRequest<OrderResponse[]>('/admin/customers/orders', { bearer, query: { phone } }).catch(() => []);
  } else {
    // WC REST has no first-class phone filter, so we use generic search.
    const res = await orderService.list({ perPage: 50, search: phone }).catch(() => ({
      items: [], total: 0, totalPages: 0, page: 1,
    }));
    matches = res.items.filter((o) => (o.customer.phone || '').replace(/\s/g, '') === phone.replace(/\s/g, ''));
  }

  return NextResponse.json({
    total: matches.length,
    orders: matches.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      total: o.total,
      createdAt: o.createdAt,
      itemsCount: o.items.reduce((s, i) => s + i.quantity, 0),
      thumbnails: o.items.map((i) => i.imageUrl).filter(Boolean).slice(0, 4),
    })),
  });
}
