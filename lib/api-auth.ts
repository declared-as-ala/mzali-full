import 'server-only';
import { cookies } from 'next/headers';
import { AT_COOKIE, RT_COOKIE } from './auth';
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
      if (!res.ok) return null;
      return (await res.json()) as RefreshResult;
    } catch {
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
 */
export async function getValidAccessToken(): Promise<string | null> {
  const store = await cookies();
  const at = store.get(AT_COOKIE)?.value;
  if (at && JWT_SECRET && verifyHs256Jwt(at, JWT_SECRET)) return at;

  const rt = store.get(RT_COOKIE)?.value;
  if (!rt || !API_BASE) return null;

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
