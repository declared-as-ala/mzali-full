/**
 * Pure decision logic behind the Admin → Commandes search box's
 * URL-sync effect (`components/admin/CommandesView.tsx`).
 *
 * The search input's displayed value is local React state (`query`),
 * updated synchronously on every keystroke. Search itself is driven by a
 * debounced push of that value into the URL's `q` param, which triggers a
 * real Next.js Server Component re-fetch — a round trip that can easily
 * take longer than the gap between keystrokes on a fast-typed phone
 * number. The old implementation resynced `query` from the URL's `q`
 * param on every change (`useEffect(() => setQuery(qParam), [qParam])`),
 * so a slow or out-of-order-resolving navigation for an earlier, shorter
 * search could land after the user had already typed further and would
 * silently erase what they'd typed since — the reported "digits
 * disappear while typing fast" bug.
 *
 * The fix: once the user has typed anything, the search box is "owned"
 * by local state and the URL becomes a write-only target for it — never
 * read back from — which removes the race entirely regardless of
 * navigation timing/ordering. `reconcileSearchQuery` is the exact,
 * side-effect-free decision this makes; extracted here so it can be unit
 * tested without mounting the full component (this codebase has no
 * DOM/component test setup — see `tests/*.test.ts` for the established
 * pure-function-unit-test convention).
 */
export type SearchSyncInput = {
  /** Current value of the URL's `q` search param. */
  qParam: string;
  /** Current value of the local input state. */
  currentQuery: string;
  /** Whether the user has typed into (or explicitly cleared/reset) the field this session. */
  ownedByUser: boolean;
};

export type SearchSyncResult =
  /** Nothing to do — `qParam` already matches what's displayed. */
  | { action: 'noop' }
  /** The user owns the field; a `qParam` echo (however stale/out-of-order) must never overwrite it. */
  | { action: 'ignore' }
  /** Genuine external change before the user has touched the field (e.g. a deep link) — safe to adopt. */
  | { action: 'adopt'; value: string };

export function reconcileSearchQuery({ qParam, currentQuery, ownedByUser }: SearchSyncInput): SearchSyncResult {
  if (qParam === currentQuery) return { action: 'noop' };
  if (ownedByUser) return { action: 'ignore' };
  return { action: 'adopt', value: qParam };
}
