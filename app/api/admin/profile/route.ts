import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { verifyPassword, setPassword, clearStoredPassword, getPasswordMeta } from '@/lib/admin-storage';
import { apiRequest } from '@/services/mzali-api/client';
import { getValidAccessToken } from '@/lib/api-auth';

const PROVIDER = process.env.COMMERCE_PROVIDER ?? 'woocommerce';

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (PROVIDER === 'mzali-api') {
    const bearer = await getValidAccessToken();
    if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const me = await apiRequest<{ email: string; mustChangePassword: boolean }>('/auth/me', { bearer });
    return NextResponse.json({
      username: me.email,
      hasCustomPassword: true,
      passwordUpdatedAt: null,
      envFallbackEnabled: false,
      mustChangePassword: me.mustChangePassword,
    });
  }

  const meta = await getPasswordMeta();
  return NextResponse.json({
    username: 'admin',
    hasCustomPassword: meta.hasCustom,
    passwordUpdatedAt: meta.updatedAt,
    envFallbackEnabled: Boolean(process.env.ADMIN_PASSWORD),
  });
}

export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { currentPassword, newPassword, confirmPassword } = await req.json();
    if (!newPassword || newPassword !== confirmPassword) {
      return NextResponse.json({ error: 'Les mots de passe ne correspondent pas.' }, { status: 400 });
    }
    if (String(newPassword).length < 8) {
      return NextResponse.json({ error: 'Au moins 8 caractères.' }, { status: 400 });
    }

    if (PROVIDER === 'mzali-api') {
      const bearer = await getValidAccessToken();
      if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      await apiRequest('/auth/password', {
        method: 'PUT',
        bearer,
        body: { currentPassword: String(currentPassword ?? ''), newPassword: String(newPassword) },
      });
      return NextResponse.json({ ok: true });
    }

    if (String(newPassword).length < 6) {
      return NextResponse.json({ error: 'Au moins 6 caractères.' }, { status: 400 });
    }
    const ok = await verifyPassword(String(currentPassword ?? ''));
    if (!ok) return NextResponse.json({ error: 'Mot de passe actuel incorrect.' }, { status: 400 });
    await setPassword(String(newPassword));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}

export async function DELETE() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (PROVIDER === 'mzali-api') {
    // No env-fallback concept on the backend; nothing to reset.
    return NextResponse.json({ ok: true });
  }
  await clearStoredPassword();
  return NextResponse.json({ ok: true });
}
