'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LiveStock } from '@/lib/order-stock';

const STALE_MS = 8_000;
const POLL_MS = 30_000;

/**
 * Live DEPOT stock for the products of an order being typed, while the employee is on the phone.
 *  - fetched as soon as a product is in the order;
 *  - re-fetched on demand (variant pick, quantity change, before Save) only when older than a few
 *    seconds, so rapid clicks never hammer the backend (concurrent requests for one product are shared);
 *  - refreshed every 30 s while the tab is visible and when the window regains focus.
 * Purely informational: the backend re-validates at save time.
 */
export function useLiveStock(apiBase: '/api/admin' | '/api/employee', productIds: string[], active: boolean) {
  const [stocks, setStocks] = useState<Record<string, LiveStock>>({});
  const stocksRef = useRef(stocks);
  stocksRef.current = stocks;
  const inflight = useRef(new Map<string, Promise<LiveStock | null>>());
  const idsKey = [...new Set(productIds)].sort().join('|');

  const load = useCallback((productId: string, force = false): Promise<LiveStock | null> => {
    const current = stocksRef.current[productId];
    if (!force && current && Date.now() - current.fetchedAt < STALE_MS) return Promise.resolve(current);
    const pending = inflight.current.get(productId);
    if (pending) return pending;
    const request = fetch(`${apiBase}/stock-availability/${productId}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json();
        const next: LiveStock = { ...data, fetchedAt: Date.now() };
        setStocks((prev) => ({ ...prev, [productId]: next }));
        return next;
      })
      .catch(() => null)
      .finally(() => { inflight.current.delete(productId); });
    inflight.current.set(productId, request);
    return request;
  }, [apiBase]);

  useEffect(() => {
    if (!active || !idsKey) return;
    for (const id of idsKey.split('|')) if (!stocksRef.current[id]) void load(id);
    const refreshAll = (force: boolean) => { if (document.visibilityState === 'visible') for (const id of idsKey.split('|')) void load(id, force); };
    const timer = window.setInterval(() => refreshAll(true), POLL_MS);
    const onFocus = () => refreshAll(false);
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [active, idsKey, load]);

  return {
    stocks,
    /** Load if unknown or stale. */
    ensure: (productId: string) => load(productId, false),
    /** Force a fresh read (used right before deciding something). */
    refresh: (productId: string) => load(productId, true),
  };
}
