/**
 * Cookie-based session.
 *
 * Two schemes coexist during the migration:
 *  - mzali-api provider: `mzali_at` holds a real HS256 JWT from the NestJS
 *    backend (verified locally with JWT_ACCESS_SECRET — no network call).
 *  - woocommerce provider (and legacy fallback): `mzali_session` holds a
 *    signed JSON payload { role, userId, name }; the old plain-string
 *    `mzali_admin` cookie is still accepted for very old sessions.
 *
 * getSession() tries the JWT first so a mid-migration browser tab with a
 * stale legacy cookie doesn't get logged out the moment the provider flips.
 */
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { getValidAccessToken } from './api-auth';
import { verifyHs256Jwt } from './jwt';

const SECRET = process.env.SESSION_SECRET ?? 'change-me';
const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? '';

export const COOKIE = 'mzali_session';
export const LEGACY_COOKIE = 'mzali_admin';
export const AT_COOKIE = 'mzali_at';
export const RT_COOKIE = 'mzali_rt';

export type Role = 'admin' | 'employee';
export type Session = { role: Role; userId: string; name: string };

type AccessTokenClaims = { sub: string; role: string; name: string; exp?: number };

function hmac(value: string): string {
  return crypto.createHmac('sha256', SECRET).update(value).digest('hex');
}

export function sign(value: string): string {
  return `${value}.${hmac(value)}`;
}

export function verify(signed: string | undefined): string | null {
  if (!signed) return null;
  const i = signed.lastIndexOf('.');
  if (i < 0) return null;
  const value = signed.slice(0, i);
  const sig = signed.slice(i + 1);
  const expected = hmac(value);
  const A = Buffer.from(sig);
  const B = Buffer.from(expected);
  if (A.length !== B.length) return null;
  return crypto.timingSafeEqual(A, B) ? value : null;
}

export function signSession(s: Session): string {
  return sign(JSON.stringify(s));
}

/** Maps a backend EmployeeRole to the legacy two-tier Role for console access. */
function mapBackendRole(role: string): Role {
  return role === 'employee' ? 'employee' : 'admin';
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();

  // 1. mzali-api JWT access token (with silent auto-refresh via refresh token if expired)
  const token = (await getValidAccessToken()) ?? store.get(AT_COOKIE)?.value;
  if (token && JWT_SECRET) {
    const claims = verifyHs256Jwt<AccessTokenClaims>(token, JWT_SECRET);
    if (claims?.sub && claims.role && claims.name) {
      return { role: mapBackendRole(claims.role), userId: claims.sub, name: claims.name };
    }
  }

  // 2. legacy signed session cookie
  const sessionCookie = store.get(COOKIE)?.value;
  const verified = verify(sessionCookie);
  if (verified) {
    try {
      const parsed = JSON.parse(verified) as Session;
      if (parsed && (parsed.role === 'admin' || parsed.role === 'employee') && parsed.userId) return parsed;
    } catch { /* fall through */ }
  }

  // 3. legacy plain-string admin cookie
  const legacy = store.get(LEGACY_COOKIE)?.value;
  if (verify(legacy) === 'admin') {
    return { role: 'admin', userId: 'admin', name: 'admin' };
  }
  return null;
}

export async function isAdmin(): Promise<boolean> {
  return (await getSession())?.role === 'admin';
}

export async function isEmployee(): Promise<boolean> {
  return (await getSession())?.role === 'employee';
}

export async function currentUserId(): Promise<string | null> {
  return (await getSession())?.userId ?? null;
}
