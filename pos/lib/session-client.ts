'use client';

const SESSION_EXPIRED_EVENT = 'mzali:pos-session-expired';
const nativeFetch = typeof window === 'undefined' ? fetch : window.fetch.bind(window);
let refreshPromise: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const response = await nativeFetch('/api/auth', { method: 'PUT', cache: 'no-store' });
  return response.ok;
}

export function refreshSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.locks) {
        return await navigator.locks.request('mzali-pos-auth-refresh', doRefresh);
      }
      return await doRefresh();
    } catch {
      return false;
    }
  })();
  void refreshPromise.finally(() => { refreshPromise = null; });
  return refreshPromise;
}

/** Retries the original POS request exactly once. Request headers—including
 * Idempotency-Key—are preserved, so a payment replay cannot create a second sale. */
export async function sessionFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const firstInput = input instanceof Request ? input.clone() : input;
  const retryInput = input instanceof Request ? input.clone() : input;
  const response = await nativeFetch(firstInput, init);
  if (response.status !== 401 || String(input).includes('/api/auth')) return response;
  if (!(await refreshSession())) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    return response;
  }
  return nativeFetch(retryInput, init);
}

export function sessionExpiredEventName(): string {
  return SESSION_EXPIRED_EVENT;
}

