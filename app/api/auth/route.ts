import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AT_COOKIE, COOKIE, LEGACY_COOKIE, RT_COOKIE, Role, signSession } from '@/lib/auth';
import { verifyPassword as verifyAdminPassword } from '@/lib/admin-storage';
import { employeeService } from '@/services';
import { adminHrefForHost } from '@/lib/admin-nav';

const PROVIDER = process.env.COMMERCE_PROVIDER ?? 'woocommerce';
const API_BASE = (process.env.MZALI_API_URL ?? '').replace(/\/+$/, '');
const SECURE_COOKIES = process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production';

type BackendLoginResult = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; email: string; name: string; role: string; mustChangePassword: boolean };
};

function mapBackendRole(role: string): Role {
  return role === 'employee' ? 'employee' : 'admin';
}

function setSessionCookies(res: NextResponse, tokens: BackendLoginResult) {
  res.cookies.set(AT_COOKIE, tokens.accessToken, {
    httpOnly: true, sameSite: 'lax', secure: SECURE_COOKIES,
    path: '/', maxAge: tokens.expiresIn,
  });
  res.cookies.set(RT_COOKIE, tokens.refreshToken, {
    httpOnly: true, sameSite: 'lax', secure: SECURE_COOKIES,
    path: '/', maxAge: 60 * 60 * 24 * 30,
  });
  // Keep the legacy cookie in sync too — any code still reading getSession()
  // via the old path (or a stale tab) sees a consistent role/name.
  const role = mapBackendRole(tokens.user.role);
  const legacyValue = signSession({ role, userId: tokens.user.id, name: tokens.user.name });
  res.cookies.set(COOKIE, legacyValue, {
    httpOnly: true, sameSite: 'lax', secure: SECURE_COOKIES,
    path: '/', maxAge: 60 * 60 * 24 * 7,
  });
  res.cookies.set(LEGACY_COOKIE, '', { maxAge: 0, path: '/' });
}

async function mzaliApiLogin(username: string, password: string, host: string | null): Promise<NextResponse> {
  const backendRes = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    cache: 'no-store',
  });
  if (!backendRes.ok) return NextResponse.json({ ok: false }, { status: 401 });
  const tokens = (await backendRes.json()) as BackendLoginResult;

  const role = mapBackendRole(tokens.user.role);
  const redirect = role === 'admin' ? adminHrefForHost('/', host) : '/employee';
  const res = NextResponse.json({ ok: true, role, redirect });
  setSessionCookies(res, tokens);
  return res;
}

/**
 * Login.
 * - If `username` is omitted or equals 'admin' (case-insensitive), this is an admin login.
 * - Otherwise treat `username` as an employee email.
 * On the mzali-api provider both paths go through the same backend endpoint
 * (it maps "admin" to the migrated super_admin account internally).
 */
export async function POST(req: Request) {
  let body: { username?: string; email?: string; password?: string } = {};
  try { body = await req.json(); } catch { /* keep empty */ }
  const password = String(body.password ?? '');
  const usernameRaw = String(body.username ?? body.email ?? '').trim();
  const isAdminLogin = !usernameRaw || usernameRaw.toLowerCase() === 'admin';

  if (PROVIDER === 'mzali-api') {
    return mzaliApiLogin(isAdminLogin ? 'admin' : usernameRaw, password, req.headers.get('host'));
  }

  if (isAdminLogin) {
    const ok = await verifyAdminPassword(password);
    if (!ok) return NextResponse.json({ ok: false }, { status: 401 });
    const cookieValue = signSession({ role: 'admin', userId: 'admin', name: 'Admin' });
    const res = NextResponse.json({ ok: true, role: 'admin', redirect: adminHrefForHost('/', req.headers.get('host')) });
    res.cookies.set(COOKIE, cookieValue, {
      httpOnly: true, sameSite: 'lax',
      secure: SECURE_COOKIES, path: '/', maxAge: 60 * 60 * 24 * 7,
    });
    // Keep legacy cookie around for back-compat with old tabs (will be ignored once expired).
    res.cookies.set(LEGACY_COOKIE, '', { maxAge: 0, path: '/' });
    return res;
  }

  // Employee login
  const employee = await employeeService.verifyCredentials(usernameRaw, password);
  if (!employee) return NextResponse.json({ ok: false }, { status: 401 });

  const cookieValue = signSession({ role: 'employee', userId: employee.id, name: employee.name });
  const res = NextResponse.json({ ok: true, role: 'employee', redirect: '/employee' });
  res.cookies.set(COOKIE, cookieValue, {
    httpOnly: true, sameSite: 'lax',
    secure: SECURE_COOKIES, path: '/', maxAge: 60 * 60 * 24 * 7,
  });
  res.cookies.set(LEGACY_COOKIE, '', { maxAge: 0, path: '/' });
  return res;
}

export async function DELETE(req: Request) {
  if (PROVIDER === 'mzali-api') {
    try {
      const store = await cookies();
      const rt = store.get(RT_COOKIE)?.value;
      if (rt) {
        await fetch(`${API_BASE}/api/v1/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
          cache: 'no-store',
        }).catch(() => undefined);
      }
    } catch { /* best-effort */ }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(AT_COOKIE, '', { maxAge: 0, path: '/' });
    res.cookies.set(RT_COOKIE, '', { maxAge: 0, path: '/' });
    res.cookies.set(COOKIE, '', { maxAge: 0, path: '/' });
    res.cookies.set(LEGACY_COOKIE, '', { maxAge: 0, path: '/' });
    return res;
  }

  void req;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, '', { maxAge: 0, path: '/' });
  res.cookies.set(LEGACY_COOKIE, '', { maxAge: 0, path: '/' });
  return res;
}
