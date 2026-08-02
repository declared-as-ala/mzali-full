/**
 * Minimal HS256 JWT verification — no external dependency. Verifies the
 * signature and `exp` claim of tokens issued by the NestJS backend
 * (@nestjs/jwt, HS256, shared secret JWT_ACCESS_SECRET).
 */
import crypto from 'crypto';

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

export function decodeJwtPayload<T = Record<string, unknown>>(token: string): T | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(base64UrlDecode(parts[1]).toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function verifyHs256Jwt<T = Record<string, unknown>>(token: string, secret: string): T | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;

  try {
    const header = JSON.parse(base64UrlDecode(headerB64).toString('utf8')) as { alg?: string };
    if (header.alg !== 'HS256') return null; // reject alg-confusion attempts
  } catch {
    return null;
  }

  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  const a = Buffer.from(sigB64);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload: (T & { exp?: number }) | null;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
  } catch {
    return null;
  }
  if (!payload) return null;
  if (typeof payload.exp === 'number' && Date.now() >= payload.exp * 1000) return null;
  return payload;
}
