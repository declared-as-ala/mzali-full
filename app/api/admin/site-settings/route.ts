import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getSiteSettings, setSiteSettings } from '@/lib/admin-storage';
import { SITE } from '@/lib/site-config';
import { apiRequest } from '@/services/mzali-api/client';
import { getValidAccessToken } from '@/lib/api-auth';

const PROVIDER = process.env.COMMERCE_PROVIDER ?? 'woocommerce';

type SiteSettingsShape = {
  photoUrl?: string;
  phones?: string[];
  whatsapp?: string;
  instagram?: string;
  tiktok?: string;
  facebook?: string;
};

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (PROVIDER === 'mzali-api') {
    const bearer = await getValidAccessToken();
    if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const saved = await apiRequest<SiteSettingsShape>('/admin/settings/site', { bearer });
    return NextResponse.json({
      photoUrl: saved.photoUrl ?? SITE.logo,
      phones: saved.phones?.length ? saved.phones : [SITE.contact.phone],
      whatsapp: saved.whatsapp ?? SITE.contact.whatsapp,
      instagram: saved.instagram ?? SITE.contact.instagram,
      tiktok: saved.tiktok ?? SITE.contact.tiktok,
      facebook: saved.facebook ?? SITE.contact.facebook,
    });
  }

  const saved = await getSiteSettings();
  return NextResponse.json({
    photoUrl: saved.photoUrl ?? SITE.logo,
    phones: saved.phones?.length ? saved.phones : [SITE.contact.phone],
    whatsapp: saved.whatsapp ?? SITE.contact.whatsapp,
    instagram: saved.instagram ?? SITE.contact.instagram,
    tiktok: saved.tiktok ?? SITE.contact.tiktok,
    facebook: saved.facebook ?? SITE.contact.facebook,
  });
}

export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const patch: SiteSettingsShape = {};

    if (typeof body.photoUrl === 'string' || body.photoUrl === null) patch.photoUrl = body.photoUrl ?? undefined;
    if (Array.isArray(body.phones)) {
      patch.phones = (body.phones as unknown[]).map((p) => String(p).trim()).filter(Boolean);
    }
    if (typeof body.whatsapp === 'string') patch.whatsapp = body.whatsapp.trim();
    if (typeof body.instagram === 'string') patch.instagram = body.instagram.trim();
    if (typeof body.tiktok === 'string') patch.tiktok = body.tiktok.trim();
    if (typeof body.facebook === 'string') patch.facebook = body.facebook.trim();

    if (PROVIDER === 'mzali-api') {
      const bearer = await getValidAccessToken();
      if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      await apiRequest('/admin/settings/site', { method: 'PUT', bearer, body: patch });
      return NextResponse.json({ ok: true });
    }

    await setSiteSettings(patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
