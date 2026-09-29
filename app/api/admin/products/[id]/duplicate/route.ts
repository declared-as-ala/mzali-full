import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { revalidateStorefront } from '@/lib/revalidate-storefront';
import { ApiError } from '@/services/mzali-api/client';
import { MzaliApiProductService } from '@/services/mzali-api/mzali-product-service';

/** Duplicates a product server-side (a real deep copy — no shared nested data). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const copy = await new MzaliApiProductService().duplicate(id, { requestId: req.headers.get('x-request-id') ?? undefined });
    revalidateStorefront();
    return NextResponse.json(copy);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'duplicate failed' }, { status: e instanceof ApiError ? e.status : 500 });
  }
}
