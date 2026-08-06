/**
 * Cookie-based employee session for the POS app. Adapted from the main
 * frontend's lib/auth.ts, simplified to a single scheme (mzali-api JWT
 * only — the POS has no legacy WooCommerce-era fallback to support).
 */
import { cookies } from 'next/headers';
import { verifyHs256Jwt } from './jwt';
import { getValidAccessToken } from './api-auth';
import { AT_COOKIE, LEGACY_AT_COOKIE } from './auth-cookies';

const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? '';

export { AT_COOKIE, RT_COOKIE } from './auth-cookies';

export type PosSession = { userId: string; role: string; name: string };
type AccessTokenClaims = { sub: string; role: string; name: string; exp?: number };

export async function getSession(): Promise<PosSession | null> {
  const store = await cookies();
  const at = (await getValidAccessToken()) ?? store.get(AT_COOKIE)?.value ?? store.get(LEGACY_AT_COOKIE)?.value;
  if (!at || !JWT_SECRET) return null;
  const claims = verifyHs256Jwt<AccessTokenClaims>(at, JWT_SECRET);
  if (!claims?.sub || !claims.role || !claims.name) return null;
  return { userId: claims.sub, role: claims.role, name: claims.name };
}

export async function isLoggedIn(): Promise<boolean> {
  return (await getSession()) !== null;
}
