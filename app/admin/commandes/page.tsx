import { orderService } from '@/services';
import CommandesView from '@/components/admin/CommandesView';
import { getSession } from '@/lib/auth';
import { NORMAL_STATUSES as normalStatuses, TENTATIVE_STATUSES } from '@/lib/order-status';

export const dynamic = 'force-dynamic';

export default async function Commandes(props: {
  searchParams?: Promise<{
    page?: string;
    q?: string;
    status?: string;
    tab?: string;
    datePreset?: string;
    startDate?: string;
    endDate?: string;
    sortOrder?: string;
  }>;
}) {
  const session = await getSession();
  const apiBase = session?.role === 'employee' ? '/api/employee' : '/api/admin';

  const sp = await props.searchParams;
  const page = Math.max(1, Number(sp?.page) || 1);
  const q = sp?.q?.trim() || undefined;
  const status = sp?.status || undefined;
  const tab = sp?.tab || 'normal';
  const datePreset = sp?.datePreset || undefined;
  const startDate = sp?.startDate || undefined;
  const endDate = sp?.endDate || undefined;

  // Determine date boundaries
  let after: string | undefined = undefined;
  let before: string | undefined = undefined;
  if (datePreset) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (datePreset === 'today') {
      after = today.toISOString();
    } else if (datePreset === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      after = yesterday.toISOString();
      before = today.toISOString();
    } else if (datePreset === '7days') {
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      after = sevenDaysAgo.toISOString();
    } else if (datePreset === 'month') {
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      after = firstOfMonth.toISOString();
    } else if (datePreset === 'custom') {
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        after = start.toISOString();
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        before = end.toISOString();
      }
    }
  }

  // Active statuses for each tab
  const NORMAL_STATUSES = normalStatuses.join(',');
  const ABANDONED_STATUSES = 'checkout-draft';

  // 'tentative' in the URL is the UI's sentinel for "every attempt" (see
  // lib/order-status.ts + CommandesView's nested filter) — expand it to the
  // real tentative-1..5 statuses before it ever reaches the backend, which
  // has no concept of that sentinel.
  const resolvedStatus = status === 'tentative' ? TENTATIVE_STATUSES.join(',') : status;

  // Determine which status to query based on current tab and active status filter
  let queryStatus = '';
  if (tab === 'trash') {
    queryStatus = 'trash';
  } else if (tab === 'abandoned') {
    queryStatus = ABANDONED_STATUSES;
  } else {
    queryStatus = resolvedStatus || NORMAL_STATUSES;
  }

  const sortOrder = (sp?.sortOrder === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';

  const wcPageSize = 100;

  // Two calls total instead of the previous seven: the current tab's page
  // of items, and ONE aggregation covering every status bucket at once
  // (backend OrdersService.counts() — a single $facet query). Both share
  // the exact same search/date scope, so the header total and every filter
  // count are guaranteed to describe the same slice of data — see
  // lib/order-status.ts for the shared labels these counts are paired with.
  const [mainResult, statusCounts] = await Promise.all([
    orderService.list({
      page,
      perPage: wcPageSize,
      status: queryStatus as any,
      search: q,
      after,
      before,
      sortOrder,
    }).catch(() => ({ items: [] as any[], total: 0, totalPages: 0, page })),
    orderService.counts({ search: q, after, before }).catch(() => ({
      total: 0, pending: 0, confirmed: 0,
      attempts: { total: 0, attempt1: 0, attempt2: 0, attempt3: 0, attempt4: 0, attempt5: 0 },
      cancelled: 0, abandoned: 0, trash: 0,
    })),
  ]);

  const items = mainResult.items;
  const total = mainResult.total;
  const totalPages = mainResult.totalPages;

  // Count orders per phone for "Client régulier" badge in the loaded subset
  const repeatCounts: Record<string, number> = {};
  for (const o of items) {
    const p = (o.customer?.phone || '').replace(/\s/g, '');
    if (!p) continue;
    repeatCounts[p] = (repeatCounts[p] ?? 0) + 1;
  }

  return (
    <CommandesView
      initialOrders={items}
      total={total}
      totalPages={totalPages}
      page={page}
      repeatCounts={repeatCounts}
      counts={statusCounts}
      apiBase={apiBase}
    />
  );
}

