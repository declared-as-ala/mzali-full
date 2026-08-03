import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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
export function middleware(req: NextRequest) {
  const adminDomain = process.env.ADMIN_DOMAIN;
  if (!adminDomain) return NextResponse.next();

  const host = (req.headers.get('host') ?? '').split(':')[0];
  const { pathname } = req.nextUrl;

  if (host === adminDomain) {
    if (pathname === '/login') {
      const url = req.nextUrl.clone();
      url.pathname = '/admin-login';
      return NextResponse.rewrite(url);
    }
    // Employee pages now live in the shared admin shell. Keep old bookmarks
    // out of the /admin/employee rewrite, which has no matching route.
    if (pathname === '/employee' || pathname.startsWith('/employee/')) {
      const url = req.nextUrl.clone();
      url.pathname = '/commandes';
      return NextResponse.redirect(url, 308);
    }
    if (pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/admin-login')) {
      return NextResponse.next();
    }
    const url = req.nextUrl.clone();
    url.pathname = pathname === '/' ? '/admin' : `/admin${pathname}`;
    return NextResponse.rewrite(url);
  }

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const url = req.nextUrl.clone();
    url.protocol = 'https';
    url.hostname = adminDomain;
    url.port = '';
    url.pathname = pathname === '/admin' ? '/' : pathname.slice('/admin'.length);
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/|api/|.*\\.[\\w]+$).*)'],
};
