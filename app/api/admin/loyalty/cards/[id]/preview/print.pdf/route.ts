import { isAdmin } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/api-auth';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new Response('unauthorized', { status: 401 });
  const bearer = await getValidAccessToken();
  if (!bearer) return new Response('unauthorized', { status: 401 });
  const { id } = await params;

  const base = (process.env.MZALI_API_URL ?? '').replace(/\/+$/, '');
  const upstream = await fetch(`${base}/api/v1/admin/loyalty/cards/${id}/preview.pdf`, {
    headers: { Authorization: `Bearer ${bearer}` },
    cache: 'no-store',
  });
  if (!upstream.ok || !upstream.body) return new Response('not found', { status: upstream.status || 404 });

  return new Response(upstream.body, {
    headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' },
  });
}
