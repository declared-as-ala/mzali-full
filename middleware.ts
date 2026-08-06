import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { PERSISTENT_SESSION_SECONDS } from '@/lib/session-duration';

const AT_COOKIE = 'mzali_admin_at';
const RT_COOKIE = 'mzali_admin_rt';
const LEGACY_AT_COOKIE = 'mzali_at';
const LEGACY_RT_COOKIE = 'mzali_rt';
const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? '';
const API_BASE = (process.env.MZALI_API_URL ?? '').replace(/\/+$/, '');
const SECURE_COOKIES = process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production';
const PROACTIVE_REFRESH_SECONDS = Number(process.env.AUTH_PROACTIVE_REFRESH_SECONDS) || 60;

/**
 * Refreshes the access token BEFORE any page renders, so a rotated refresh
 * token is always persisted.
 *
 * Why this exists: app/admin/**\/page.tsx and app/employee/**\/page.tsx are
 * Server Components that call getSession() -> getValidAccessToken() (see
 * lib/api-auth.ts) during render. Next.js does not allow setting cookies
 * from a Server Component render — only from a Route Handler, Server
 * Action, or Middleware. So when the 15-minute access token expired and a
 * page re-rendered (any navigation or reload), getValidAccessToken() would
 * fetch a *new* rotated token pair from the backend for that one render,
 * but silently fail to persist it (caught by its own try/catch — see that
 * file's comment). The browser kept the stale, already-rotated refresh
 * token. The next request to present that stale token — another page load
 * or a background API call — was rejected by the backend's reuse-detection
 * (a rotated-away refresh token being reused looks identical to a stolen
 * one) and revoked the entire session family, forcing a real login. In
 * practice this made admin/employee sessions "expire" every ~15 minutes of
 * idle time, far short of the intended 30-day refresh lifetime.
 *
 * Middleware runs before every matched request and CAN set cookies on the
 * response, so the refresh+persist here always succeeds. It also rewrites
 * the outgoing request's Cookie header so the same request's downstream
 * page immediately sees the fresh access token instead of attempting (and
 * racing) its own refresh.
 *
 * Scope: only page navigations go through this (see config.matcher below,
 * which already excluded api/ before this was added) — Route Handlers
 * under app/api/** run in a mutable-cookie context already and persist
 * their own refresh correctly, so they don't have this bug.
 */

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

/**
 * Refreshes the session if needed and returns the (possibly rewritten)
 * request headers plus a function to attach fresh Set-Cookie headers to
 * whichever response the caller ends up returning (next/rewrite/redirect
 * all need it — a redirect still needs the browser to receive the new
 * cookies before it follows up with the next request).
 */
async function refreshSessionCookies(req: NextRequest): Promise<{ requestHeaders: Headers; applyCookies: (res: NextResponse) => NextResponse }> {
  const noop = { requestHeaders: req.headers, applyCookies: (res: NextResponse) => res };

  const at = req.cookies.get(AT_COOKIE)?.value ?? req.cookies.get(LEGACY_AT_COOKIE)?.value;
  if (at && (await isValidAccessToken(at))) return noop;

  const rt = req.cookies.get(RT_COOKIE)?.value ?? req.cookies.get(LEGACY_RT_COOKIE)?.value;
  if (!rt || !API_BASE) return noop;

  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
      cache: 'no-store',
    });
    if (!res.ok) return noop;
    const data = (await res.json()) as { accessToken: string; refreshToken: string; expiresIn: number };

    const requestHeaders = new Headers(req.headers);
    setRequestCookie(requestHeaders, AT_COOKIE, data.accessToken);
    setRequestCookie(requestHeaders, RT_COOKIE, data.refreshToken);

    return {
      requestHeaders,
      applyCookies: (response: NextResponse) => {
        response.cookies.set(AT_COOKIE, data.accessToken, {
          httpOnly: true, sameSite: 'lax', secure: SECURE_COOKIES, path: '/', maxAge: data.expiresIn,
        });
        response.cookies.set(RT_COOKIE, data.refreshToken, {
          httpOnly: true, sameSite: 'lax', secure: SECURE_COOKIES, path: '/', maxAge: PERSISTENT_SESSION_SECONDS,
        });
        response.cookies.set(LEGACY_AT_COOKIE, '', { maxAge: 0, path: '/' });
        response.cookies.set(LEGACY_RT_COOKIE, '', { maxAge: 0, path: '/' });
        return response;
      },
    };
  } catch {
    return noop;
  }
}

/**
 * Serves the admin section from its own subdomain with no /admin prefix in
 * the URL bar, while the pages themselves still live under app/admin/** (no
 * separate app/container — see docs/deployment/ovh-production-audit.md §6).
 *
 * On ADMIN_DOMAIN: rewrite bare paths to their /admin/* equivalent
 * internally (invisible to the browser). Idempotent — a path that already
 * starts with /admin passes through unchanged, so any stray hardcoded link
 * still resolves instead of doubling into /admin/admin/....
 *
 * On the main storefront domain: old /admin/* links redirect over to the
 * subdomain instead, for backward compatibility with existing bookmarks.
 */
export async function middleware(req: NextRequest) {
  const { requestHeaders, applyCookies } = await refreshSessionCookies(req);
  const nextOpts = { request: { headers: requestHeaders } };

  const adminDomain = process.env.ADMIN_DOMAIN;
  if (!adminDomain) return applyCookies(NextResponse.next(nextOpts));

  const host = (req.headers.get('host') ?? '').split(':')[0];
  const { pathname } = req.nextUrl;

  if (host === adminDomain) {
    if (pathname === '/login') {
      const url = req.nextUrl.clone();
      url.pathname = '/admin-login';
      return applyCookies(NextResponse.rewrite(url, nextOpts));
    }
    // Employee pages now live in the shared admin shell. Keep old bookmarks
    // out of the /admin/employee rewrite, which has no matching route.
    if (pathname === '/employee' || pathname.startsWith('/employee/')) {
      const url = req.nextUrl.clone();
      url.pathname = '/commandes';
      return applyCookies(NextResponse.redirect(url, 308));
    }
    if (pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/admin-login')) {
      return applyCookies(NextResponse.next(nextOpts));
    }
    const url = req.nextUrl.clone();
    url.pathname = pathname === '/' ? '/admin' : `/admin${pathname}`;
    return applyCookies(NextResponse.rewrite(url, nextOpts));
  }

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const url = req.nextUrl.clone();
    url.protocol = 'https';
    url.hostname = adminDomain;
    url.port = '';
    url.pathname = pathname === '/admin' ? '/' : pathname.slice('/admin'.length);
    return applyCookies(NextResponse.redirect(url, 308));
  }

  return applyCookies(NextResponse.next(nextOpts));
}

export const config = {
  matcher: ['/((?!_next/|api/|.*\\.[\\w]+$).*)'],
};
