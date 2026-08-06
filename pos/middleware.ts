import { NextRequest, NextResponse } from 'next/server';
import { AT_COOKIE, LEGACY_AT_COOKIE, LEGACY_RT_COOKIE, RT_COOKIE } from '@/lib/auth-cookies';
import { PERSISTENT_SESSION_SECONDS } from '@/lib/session-duration';

/**
 * Refreshes the access token BEFORE any page or API route runs, so the
 * rotated refresh token always gets persisted.
 *
 * Why this exists: pages under app/*\/page.tsx are Server Components that
 * call getSession() -> getValidAccessToken() during render. Next.js does
 * not allow setting cookies from a Server Component render — only from a
 * Route Handler, Server Action, or Middleware. So when the 15-minute
 * access token expired and a page re-rendered (any navigation or reload),
 * getValidAccessToken() would successfully fetch a *new* rotated token
 * pair from the backend for that one render, but silently fail to persist
 * it (caught by its own try/catch). The browser kept the stale, now-
 * already-rotated refresh token. The very next request to present that
 * stale token — another page load or a background API call — was
 * rejected by the backend's reuse-detection (a rotated-away refresh token
 * being reused looks identical to a stolen one) and revoked the entire
 * session family, forcing a real login. In practice this made the session
 * "expire" every ~15 minutes of idle time, far short of the intended
 * 30-day refresh lifetime.
 *
 * Middleware runs before every matched request and CAN set cookies on the
 * response, so the refresh+persist here always succeeds. It also rewrites
 * the outgoing request's Cookie header so the same request's downstream
 * page/route handler immediately sees the fresh access token instead of
 * attempting (and racing) its own refresh.
 */
const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? '';
const API_BASE = (process.env.MZALI_API_URL ?? '').replace(/\/+$/, '');
const SECURE_COOKIES = process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production';
const PROACTIVE_REFRESH_SECONDS = Number(process.env.AUTH_PROACTIVE_REFRESH_SECONDS) || 60;

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlDecodeJson(input: string): Record<string, unknown> | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(input)));
  } catch {
    return null;
  }
}

/** Web Crypto HS256 verify — Edge-runtime-compatible (Node's `crypto`
 *  module used by lib/jwt.ts isn't available here). */
async function isValidAccessToken(token: string): Promise<boolean> {
  if (!JWT_SECRET) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [headerB64, payloadB64, sigB64] = parts;

  const header = base64UrlDecodeJson(headerB64);
  if (!header || header.alg !== 'HS256') return false;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify('HMAC', key, base64UrlToBytes(sigB64) as BufferSource, new TextEncoder().encode(`${headerB64}.${payloadB64}`));
    if (!valid) return false;
  } catch {
    return false;
  }

  const payload = base64UrlDecodeJson(payloadB64);
  if (!payload) return false;
  if (typeof payload.exp === 'number' && Date.now() + PROACTIVE_REFRESH_SECONDS * 1000 >= payload.exp * 1000) return false;
  return true;
}

function setRequestCookie(headers: Headers, name: string, value: string): void {
  const existing = headers.get('cookie') ?? '';
  const kept = existing.split(';').map((c) => c.trim()).filter((c) => c && !c.startsWith(`${name}=`));
  kept.push(`${name}=${value}`);
  headers.set('cookie', kept.join('; '));
}

const SKIP_PREFIXES = ['/login', '/api/auth', '/_next', '/pairing'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (SKIP_PREFIXES.some((p) => pathname.startsWith(p)) || /\.[a-zA-Z0-9]+$/.test(pathname)) {
    return NextResponse.next();
  }

  const at = req.cookies.get(AT_COOKIE)?.value ?? req.cookies.get(LEGACY_AT_COOKIE)?.value;
  if (at && (await isValidAccessToken(at))) {
    return NextResponse.next();
  }

  const rt = req.cookies.get(RT_COOKIE)?.value ?? req.cookies.get(LEGACY_RT_COOKIE)?.value;
  if (!rt || !API_BASE) {
    return NextResponse.next();
  }

  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
      cache: 'no-store',
    });
    if (!res.ok) return NextResponse.next();
    const data = (await res.json()) as { accessToken: string; refreshToken: string; expiresIn: number };

    const requestHeaders = new Headers(req.headers);
    setRequestCookie(requestHeaders, AT_COOKIE, data.accessToken);
    setRequestCookie(requestHeaders, RT_COOKIE, data.refreshToken);

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.cookies.set(AT_COOKIE, data.accessToken, {
      httpOnly: true, sameSite: 'lax', secure: SECURE_COOKIES, path: '/', maxAge: data.expiresIn,
    });
    response.cookies.set(RT_COOKIE, data.refreshToken, {
      httpOnly: true, sameSite: 'lax', secure: SECURE_COOKIES, path: '/', maxAge: PERSISTENT_SESSION_SECONDS,
    });
    response.cookies.set(LEGACY_AT_COOKIE, '', { maxAge: 0, path: '/' });
    response.cookies.set(LEGACY_RT_COOKIE, '', { maxAge: 0, path: '/' });
    return response;
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
