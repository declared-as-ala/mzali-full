import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { apiUpload } from '@/services/mzali-api/client';
import { withAuthRetry } from '@/services/mzali-api/with-auth-retry';

const PROVIDER = process.env.COMMERCE_PROVIDER ?? 'woocommerce';

/**
 * Upload an image from the browser.
 * - woocommerce provider: WordPress media library (Application Password).
 * - mzali-api provider: MinIO via the backend's /admin/media endpoint.
 * Returns: { id, url }
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let file: File | null = null;
  let form: FormData;
  try {
    form = await req.formData();
    const f = form.get('file');
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: 'Fichier > 8 MB' }, { status: 400 });
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return NextResponse.json({ error: 'Format accepté : JPEG, PNG ou WEBP' }, { status: 400 });
  }

  if (PROVIDER === 'mzali-api') {
    try {
      const result = await withAuthRetry((bearer) => {
        if (!bearer) throw new Error('unauthorized');
        return apiUpload<{ id: string; url: string }>('/admin/media', form, bearer);
      });
      return NextResponse.json({ id: result.id, url: result.url });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'upload failed' }, { status: 500 });
    }
  }

  const user = process.env.WP_ADMIN_USER;
  const pass = process.env.WP_APP_PASSWORD;
  const wpBase = (process.env.WC_API_URL ?? '').replace(/\/+$/, '');
  if (!user || !pass || !wpBase) {
    return NextResponse.json({
      error: 'WP_ADMIN_USER / WP_APP_PASSWORD / WC_API_URL non configurés (.env.local).',
    }, { status: 500 });
  }

  const arrayBuf = await file.arrayBuffer();
  const safeName = file.name.replace(/[^\w.\-]/g, '_') || `upload-${Date.now()}.jpg`;
  const auth = Buffer.from(`${user}:${pass.replace(/\s/g, '')}`).toString('base64');

  const wpRes = await fetch(`${wpBase}/wp-json/wp/v2/media`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': file.type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${safeName}"`,
    },
    body: Buffer.from(arrayBuf),
  });

  const text = await wpRes.text();
  let json: { id?: number; source_url?: string; message?: string };
  try { json = JSON.parse(text) as typeof json; } catch { json = { message: text.slice(0, 300) }; }

  if (!wpRes.ok || !json.id || !json.source_url) {
    return NextResponse.json(
      { error: json.message ?? `WP media upload failed (${wpRes.status})` },
      { status: wpRes.status || 500 },
    );
  }
  return NextResponse.json({ id: String(json.id), url: json.source_url });
}
