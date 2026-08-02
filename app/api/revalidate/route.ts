import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

/**
 * Called only by the backend worker (X-Service-Token authenticated), never
 * by the browser — invalidates cached storefront pages when a product's
 * online availability crosses the sold-out boundary. See
 * docs/pos-platform/stock-business-rules.md and SPRINT-04's real-time sync.
 */
export async function POST(req: Request) {
  const token = req.headers.get('x-service-token');
  if (!token || token !== process.env.MZALI_SERVICE_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { paths?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const paths = Array.isArray(body.paths) ? body.paths.filter((p): p is string => typeof p === 'string' && p.startsWith('/')) : [];
  if (!paths.length) return NextResponse.json({ error: 'paths required' }, { status: 400 });

  for (const path of paths) revalidatePath(path);
  return NextResponse.json({ revalidated: paths });
}
