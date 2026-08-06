import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AT_COOKIE, LEGACY_AT_COOKIE, LEGACY_RT_COOKIE, RT_COOKIE } from '@/lib/auth-cookies';
import { apiRequest } from '@/lib/api-client';
import { PERSISTENT_SESSION_SECONDS } from '@/lib/session-duration';
import { accessTokenRemainingSeconds, getValidAccessToken } from '@/lib/api-auth';

const SECURE_COOKIES = process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production';

type LoginResult = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; email: string; name: string; role: string; mustChangePassword: boolean };
};

export async function POST(req: Request) {
  let body: { email?: string; password?: string } = {};
  try { body = await req.json(); } catch { /* keep empty */ }
  const email = String(body.email ?? '').trim();
  const password = String(body.password ?? '');
  if (!email || !password) return NextResponse.json({ ok: false, error: 'Identifiants requis' }, { status: 400 });

  try {
    const data = await apiRequest<LoginResult>('/auth/login', {
      method: 'POST',
      body: { username: email, password },
    });
    const res = NextResponse.json({ ok: true, name: data.user.name, role: data.user.role });
    res.cookies.set(AT_COOKIE, data.accessToken, {
      httpOnly: true, sameSite: 'lax', secure: SECURE_COOKIES, path: '/', maxAge: data.expiresIn,
    });
    res.cookies.set(RT_COOKIE, data.refreshToken, {
      httpOnly: true, sameSite: 'lax', secure: SECURE_COOKIES, path: '/', maxAge: PERSISTENT_SESSION_SECONDS,
    });
    res.cookies.set(LEGACY_AT_COOKIE, '', { maxAge: 0, path: '/' });
    res.cookies.set(LEGACY_RT_COOKIE, '', { maxAge: 0, path: '/' });
    return res;
  } catch {
    return NextResponse.json({ ok: false, error: 'Identifiants invalides' }, { status: 401 });
  }
}

export async function PUT() {
  const proactive = Number(process.env.AUTH_PROACTIVE_REFRESH_SECONDS) || 60;
  const token = await getValidAccessToken({ minValiditySeconds: proactive });
  if (!token) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, expiresIn: accessTokenRemainingSeconds(token) });
}

export async function DELETE() {
  try {
    const store = await cookies();
    const rt = store.get(RT_COOKIE)?.value;
    if (rt) {
      await apiRequest('/auth/logout', { method: 'POST', body: { refreshToken: rt } }).catch(() => undefined);
    }
  } catch { /* best-effort */ }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AT_COOKIE, '', { maxAge: 0, path: '/' });
  res.cookies.set(RT_COOKIE, '', { maxAge: 0, path: '/' });
  res.cookies.set(LEGACY_AT_COOKIE, '', { maxAge: 0, path: '/' });
  res.cookies.set(LEGACY_RT_COOKIE, '', { maxAge: 0, path: '/' });
  return res;
}
