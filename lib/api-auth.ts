import 'server-only';
import { cookies } from 'next/headers';
import { AT_COOKIE, LEGACY_AT_COOKIE, LEGACY_RT_COOKIE, RT_COOKIE } from './auth';
import { verifyHs256Jwt } from './jwt';
import { PERSISTENT_SESSION_SECONDS } from './session-duration';

const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? '';
const API_BASE = (process.env.MZALI_API_URL ?? '').replace(/\/+$/, '');
const SECURE_COOKIES = process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production';

type RefreshResult = { accessToken: string; refreshToken: string; expiresIn: number };

// Admin/employee pages fire several parallel BFF requests on mount (e.g. the
// dashboard's per-panel fetches). Each one independently hits this module
// when the access token is expired, and the backend's refresh-token rotation
// treats a second use of the same (already-rotated) refresh token as reuse/
// theft and revokes the whole session family. Sharing one in-flight refresh
// per token value across concurrent requests in this process avoids that
// race instead of letting every panel race the backend.
const inflightRefreshes = new Map<string, Promise<RefreshResult | null>>();

/** Structured, token-free diagnostic logging for the auth-refresh flow —
 *  never logs the token/cookie values themselves. */
function logAuth(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, ...fields }));
}

function refreshWithBackend(rt: string): Promise<RefreshResult | null> {
  const existing = inflightRefreshes.get(rt);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
        cache: 'no-store',
      });
      if (!res.ok) {
        logAuth('session.refresh_failed', { status: res.status });
        return null;
      }
      logAuth('session.refresh_success');
      return (await res.json()) as RefreshResult;
    } catch (e) {
      logAuth('session.refresh_error', { message: e instanceof Error ? e.message : 'unknown' });
      return null;
    }
  })();

  inflightRefreshes.set(rt, promise);
  void promise.finally(() => inflightRefreshes.delete(rt));
  return promise;
}

/**
 * Returns a valid backend access token for the current request, refreshing
 * it via the rotating refresh token when the access token is missing or
 * expired. Refreshed tokens are written back to the response cookies
 * (mutable `cookies()` inside a Route Handler attaches Set-Cookie headers
 * automatically). Returns null when the caller has no session at all —
 * callers should treat that as "not authenticated" for admin/employee routes.
 *
 * Safe to call from a Server Component render too (e.g. app/admin/page.tsx):
 * admin/employee layouts already verify the access token via getSession()
 * before rendering the page, so the fast "token still valid" path below is
 * what normally runs there. In the rare case a refresh IS needed from a
 * non-mutable context, Next.js throws on cookies().set() — that's caught so
 * the page still gets a usable token for this one request (the rotation
 * just won't be persisted; the next request re-triggers a refresh).
 *
 * `forceRefresh: true` skips the local "looks still valid" check and always
 * exchanges the refresh token for a new pair. Used by withAuthRetry (see
 * services/mzali-api/with-auth-retry.ts) for the rare case the backend
 * rejects a token this process believed was still good — a clock-skew edge
 * case, or a request that raced a refresh triggered elsewhere.
 */
type TokenClaims = { exp?: number };

export function accessTokenRemainingSeconds(token: string | null | undefined): number {
  if (!token || !JWT_SECRET) return 0;
  const claims = verifyHs256Jwt<TokenClaims>(token, JWT_SECRET);
  return claims?.exp ? Math.max(0, Math.floor(claims.exp - Date.now() / 1000)) : 0;
}

export async function getValidAccessToken(opts: { forceRefresh?: boolean; minValiditySeconds?: number } = {}): Promise<string | null> {
  const store = await cookies();
  const at = store.get(AT_COOKIE)?.value ?? store.get(LEGACY_AT_COOKIE)?.value;
  const remaining = accessTokenRemainingSeconds(at);
  if (!opts.forceRefresh && at && remaining > (opts.minValiditySeconds ?? 0)) return at;

  const rt = store.get(RT_COOKIE)?.value ?? store.get(LEGACY_RT_COOKIE)?.value;
  if (!rt || !API_BASE) {
    logAuth('session.cookie_missing', { hadAccessToken: Boolean(at), hasApiBase: Boolean(API_BASE) });
    return null;
  }

  try {
    const data = await refreshWithBackend(rt);
    if (!data) return null;

    try {
      store.set(AT_COOKIE, data.accessToken, {
        httpOnly: true, sameSite: 'lax', secure: SECURE_COOKIES,
        path: '/', maxAge: data.expiresIn,
      });
      // path: '/' (not scoped to /api/auth) — every admin/employee API route
      // needs to read this cookie to silently refresh on an expired access
      // token; a narrower path would hide it from all of them (cookies are
      // only sent when the request path matches). Still httpOnly + secure +
      // SameSite=Lax, so this doesn't weaken exposure to client-side JS.
      store.set(RT_COOKIE, data.refreshToken, {
        httpOnly: true, sameSite: 'lax', secure: SECURE_COOKIES,
        path: '/', maxAge: PERSISTENT_SESSION_SECONDS,
      });
      store.delete(LEGACY_AT_COOKIE);
      store.delete(LEGACY_RT_COOKIE);
    } catch {
      // Called from a non-mutable context (Server Component render) — the
      // rotated pair can't be persisted here. Still return the fresh access
      // token so this request succeeds.
    }
    return data.accessToken;
  } catch {
    return null;
  }
}
