import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Edge-compatible cookie verification using Web Crypto (SubtleCrypto).
 * This mirrors lib/auth.ts but avoids `node:crypto` so the middleware/proxy can run on Edge.
 */
const COOKIE = 'mzali_session';
const LEGACY_COOKIE = 'mzali_admin';
const SECRET = process.env.SESSION_SECRET ?? 'change-me';

const encoder = new TextEncoder();

let cachedKey: CryptoKey | null = null;
async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  cachedKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return cachedKey;
}

async function hmacHex(value: string): Promise<string> {
  const key = await getKey();
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  const bytes = new Uint8Array(sigBuf);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

/** Constant-time string comparison. */
function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verify(signed: string | undefined): Promise<string | null> {
  if (!signed) return null;
  const i = signed.lastIndexOf('.');
  if (i < 0) return null;
  const value = signed.slice(0, i);
  const sig = signed.slice(i + 1);
  const expected = await hmacHex(value);
  return safeEq(sig, expected) ? value : null;
}

async function readRole(req: NextRequest): Promise<'admin' | 'employee' | null> {
  const session = await verify(req.cookies.get(COOKIE)?.value);
  if (session) {
    try {
      const parsed = JSON.parse(session) as { role?: string };
      if (parsed?.role === 'admin' || parsed?.role === 'employee') return parsed.role;
    } catch { /* ignore */ }
  }
  // Legacy admin-only cookie ('admin' signed string)
  if ((await verify(req.cookies.get(LEGACY_COOKIE)?.value)) === 'admin') return 'admin';
  return null;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const role = await readRole(req);

  // /admin/* requires role=admin (excludes /admin-login itself)
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    if (role !== 'admin') {
      const url = req.nextUrl.clone();
      url.pathname = '/admin-login';
      url.searchParams.set('from', pathname);
      return NextResponse.redirect(url);
    }
  }

  // /employee/* requires role=employee (or admin can visit too)
  if (pathname.startsWith('/employee')) {
    if (role !== 'employee' && role !== 'admin') {
      const url = req.nextUrl.clone();
      url.pathname = '/admin-login';
      url.searchParams.set('from', pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*', '/employee/:path*'] };
