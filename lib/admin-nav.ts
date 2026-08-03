/**
 * Admin pages live under app/admin/** but are served with no /admin prefix
 * when reached via the admin subdomain (middleware.ts rewrites the incoming
 * request). Internal links/redirects must match that: prefix-free on the
 * subdomain, /admin-prefixed as a backward-compat fallback everywhere else
 * (e.g. old bookmarks that land here before middleware's redirect fires, or
 * local dev where there is no subdomain at all).
 */

/**
 * Derives admin.<main-domain> from the already-public NEXT_PUBLIC_SITE_URL,
 * rather than needing a second baked-in build-time env var just for this.
 */
function expectedAdminHost(): string | null {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) return null;
  try {
    return `admin.${new URL(siteUrl).hostname}`;
  } catch {
    return null;
  }
}

/** Client-side: true when the current page is being served from the admin subdomain. */
export function onAdminSubdomain(): boolean {
  const adminHost = expectedAdminHost();
  return typeof window !== 'undefined' && !!adminHost && window.location.hostname === adminHost;
}

/** Client-side: build a path for an admin page, e.g. adminHref('/commandes'). */
export function adminHref(path: string): string {
  if (onAdminSubdomain()) return path;
  return path === '/' ? '/admin' : `/admin${path}`;
}

/** Client-side: the login page — '/login' on the subdomain, '/admin-login' elsewhere. */
export function adminLoginHref(query?: string): string {
  const base = onAdminSubdomain() ? '/login' : '/admin-login';
  return query ? `${base}?${query}` : base;
}

/**
 * Strips a leading /admin from the current pathname (usePathname()) so
 * active-link comparisons work the same whether the browser is showing a
 * clean subdomain path or the /admin-prefixed fallback. '/admin' itself
 * normalizes to '/'.
 */
export function normalizeAdminPath(path: string): string {
  if (path === '/admin') return '/';
  if (path.startsWith('/admin/')) return path.slice('/admin'.length);
  return path;
}

/** Server-side: same decision, given a Host header value. */
export function adminHrefForHost(path: string, host: string | null | undefined): string {
  const adminDomain = process.env.ADMIN_DOMAIN;
  if (adminDomain && host?.split(':')[0] === adminDomain) {
    return path;
  }
  return path === '/' ? '/admin' : `/admin${path}`;
}
