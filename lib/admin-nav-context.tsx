'use client';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

/**
 * adminHref()'s window-based host check can't run during SSR/first paint
 * (no window yet), so any href rendered directly in JSX would show the
 * wrong (/admin-prefixed) value on first paint even on the admin subdomain.
 * This context carries the host decision down from app/admin/layout.tsx,
 * which already computes it server-side via headers() for the login
 * redirect. Components that only need adminHref()/adminLoginHref() inside
 * an event handler (post-hydration) don't need this — window is reliable
 * by then.
 */
const AdminHostContext = createContext(false);

export function AdminHostProvider({ isAdminHost, children }: { isAdminHost: boolean; children: ReactNode }) {
  return <AdminHostContext.Provider value={isAdminHost}>{children}</AdminHostContext.Provider>;
}

function buildHref(isAdminHost: boolean) {
  return (path: string) => (isAdminHost ? path : path === '/' ? '/admin' : `/admin${path}`);
}

/** For hrefs rendered directly in JSX — safe during SSR, unlike the plain adminHref(). */
export function useAdminHref() {
  const isAdminHost = useContext(AdminHostContext);
  // Stable reference across renders (isAdminHost never changes mid-session),
  // so it's safe to list in other hooks' dependency arrays.
  return useMemo(() => buildHref(isAdminHost), [isAdminHost]);
}
