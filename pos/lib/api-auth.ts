import 'server-only';
import { cookies } from 'next/headers';
import { AT_COOKIE, RT_COOKIE } from './auth';
import { verifyHs256Jwt } from './jwt';

const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? '';
const API_BASE = (process.env.MZALI_API_URL ?? '').replace(/\/+$/, '');
const SECURE_COOKIES = process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production';

type RefreshResult = { accessToken: string; refreshToken: string; expiresIn: number };

/**
 * Returns a valid backend access token, refreshing it via the rotating
 * refresh token when missing/expired. Same pattern as the main frontend's
 * lib/api-auth.ts — see that file's comments for the mutable-cookies
 * nuance in Server Component render paths.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const store = await cookies();
  const at = store.get(AT_COOKIE)?.value;
  if (at && JWT_SECRET && verifyHs256Jwt(at, JWT_SECRET)) return at;

  const rt = store.get(RT_COOKIE)?.value;
  if (!rt || !API_BASE) return null;

  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as RefreshResult;

    try {
      store.set(AT_COOKIE, data.accessToken, {
        httpOnly: true, sameSite: 'lax', secure: SECURE_COOKIES,
        path: '/', maxAge: data.expiresIn,
      });
      store.set(RT_COOKIE, data.refreshToken, {
        httpOnly: true, sameSite: 'lax', secure: SECURE_COOKIES,
        path: '/', maxAge: 60 * 60 * 24 * 30,
      });
    } catch {
      // Called from a non-mutable context (Server Component render).
    }
    return data.accessToken;
  } catch {
    return null;
  }
}
