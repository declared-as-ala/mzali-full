'use client';

const SESSION_EXPIRED_EVENT = 'mzali:session-expired';
const nativeFetch = typeof window === 'undefined' ? fetch : window.fetch.bind(window);
let refreshPromise: Promise<boolean> | null = null;
let installed = false;

function isProtectedApi(input: RequestInfo | URL): boolean {
  try {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    return url.origin === window.location.origin && url.pathname.startsWith('/api/') && url.pathname !== '/api/auth';
  } catch {
    return false;
  }
}

async function doRefresh(): Promise<boolean> {
  const response = await nativeFetch('/api/auth', {
    method: 'PUT',
    headers: { 'Cache-Control': 'no-store' },
    cache: 'no-store',
  });
  return response.ok;
}

export function refreshSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.locks) {
        return await navigator.locks.request('mzali-admin-auth-refresh', doRefresh);
      }
      return await doRefresh();
    } catch {
      return false;
    }
  })();
  void refreshPromise.finally(() => { refreshPromise = null; });
  return refreshPromise;
}

/** Same-origin BFF client: one silent refresh for any number of concurrent
 * 401s, then exactly one replay of each original request. */
export async function sessionFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const protectedApi = typeof window !== 'undefined' && isProtectedApi(input);
  const firstInput = input instanceof Request ? input.clone() : input;
  const retryInput = input instanceof Request ? input.clone() : input;
  const response = await nativeFetch(firstInput, init);
  if (!protectedApi || response.status !== 401) return response;

  if (!(await refreshSession())) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    return response;
  }
  return nativeFetch(retryInput, init);
}

/** Installs the shared client for existing Admin/Employee components. The
 * wrapper only touches same-origin /api/* calls and explicitly excludes the
 * auth endpoint, preventing refresh loops. */
export function installSessionFetch(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.fetch = sessionFetch as typeof window.fetch;
}

export function sessionExpiredEventName(): string {
  return SESSION_EXPIRED_EVENT;
}

