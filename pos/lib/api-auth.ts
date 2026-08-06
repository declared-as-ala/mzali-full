import 'server-only';
import { cookies } from 'next/headers';
import { AT_COOKIE, LEGACY_AT_COOKIE, LEGACY_RT_COOKIE, RT_COOKIE } from './auth-cookies';
import { verifyHs256Jwt } from './jwt';
import { PERSISTENT_SESSION_SECONDS } from './session-duration';

const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? '';
const API_BASE = (process.env.MZALI_API_URL ?? '').replace(/\/+$/, '');
const SECURE_COOKIES = process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production';

type RefreshResult = { accessToken: string; refreshToken: string; expiresIn: number };

const inflightRefreshes = new Map<string, Promise<RefreshResult | null>>();

function refreshWithBackend(rt: string): Promise<RefreshResult | null> {
  const existing = inflightRefreshes.get(rt);
  if (existing) return existing;
  const pending = (async () => {
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
  inflightRefreshes.set(rt, pending);
  void pending.finally(() => inflightRefreshes.delete(rt));
  return pending;
}

/**
 * Returns a valid backend access token, refreshing it via the rotating
 * refresh token when missing/expired. Same pattern as the main frontend's
 * lib/api-auth.ts — see that file's comments for the mutable-cookies
 * nuance in Server Component render paths.
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
  if (!opts.forceRefresh && at && accessTokenRemainingSeconds(at) > (opts.minValiditySeconds ?? 0)) return at;

  const rt = store.get(RT_COOKIE)?.value ?? store.get(LEGACY_RT_COOKIE)?.value;
  if (!rt || !API_BASE) return null;

  try {
    const data = await refreshWithBackend(rt);
    if (!data) return null;

    try {
      store.set(AT_COOKIE, data.accessToken, {
        httpOnly: true, sameSite: 'lax', secure: SECURE_COOKIES,
        path: '/', maxAge: data.expiresIn,
      });
      store.set(RT_COOKIE, data.refreshToken, {
        httpOnly: true, sameSite: 'lax', secure: SECURE_COOKIES,
        path: '/', maxAge: PERSISTENT_SESSION_SECONDS,
      });
      store.delete(LEGACY_AT_COOKIE);
      store.delete(LEGACY_RT_COOKIE);
    } catch {
      // Called from a non-mutable context (Server Component render).
    }
    return data.accessToken;
  } catch {
    return null;
  }
}
