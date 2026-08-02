import { orderService } from '@/services';
import CommandesView from '@/components/admin/CommandesView';

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
  }>;
}) {
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

  // Active WooCommerce statuses for each tab
  const NORMAL_STATUSES = 'en-attente,confirme,annule,tentative';
  const ABANDONED_STATUSES = 'checkout-draft';

  // Determine which status to query based on current tab and active status filter
  let queryStatus = '';
  if (tab === 'trash') {
    queryStatus = 'trash';
  } else if (tab === 'abandoned') {
    queryStatus = ABANDONED_STATUSES;
  } else {
    queryStatus = status || NORMAL_STATUSES;
  }

  const wcPageSize = 100;
  const promises = [];

  // 1. Fetch current tab's items
  promises.push(
    orderService.list({
      page,
      perPage: wcPageSize,
      status: queryStatus as any,
      search: q,
      after,
      before,
    }).catch(() => ({
      items: [],
      total: 0,
      totalPages: 0,
      page,
    }))
  );

  // 2. Fetch counts for each individual status dynamically in parallel to get exact counts
  const statusesToCount = ['en-attente', 'confirme', 'tentative', 'annule', 'checkout-draft', 'trash'];
  for (const s of statusesToCount) {
    promises.push(
      orderService.list({
        page: 1,
        perPage: 1,
        status: s as any,
        search: q,
        after,
        before,
      }).then((res) => ({ status: s, total: res.total }))
        .catch(() => ({ status: s, total: 0 }))
    );
  }

  const [mainResult, ...countResults] = await Promise.all(promises);

  const items = (mainResult as any).items;
  const total = (mainResult as any).total;
  const totalPages = (mainResult as any).totalPages;

  // Build map of status counts
  const statusCountsMap: Record<string, number> = {};
  for (const r of countResults) {
    const res = r as { status: string; total: number };
    statusCountsMap[res.status] = res.total;
  }

  // Derive tab counts from the status counts map
  const tabCounts = {
    normal: (statusCountsMap['en-attente'] ?? 0) + 
            (statusCountsMap['confirme'] ?? 0) + 
            (statusCountsMap['tentative'] ?? 0) + 
            (statusCountsMap['annule'] ?? 0),
    abandoned: statusCountsMap['checkout-draft'] ?? 0,
    trash: statusCountsMap['trash'] ?? 0,
  };

  // Count orders per phone for "Client régulier" badge in the loaded subset
  const counts: Record<string, number> = {};
  for (const o of items) {
    const p = (o.customer.phone || '').replace(/\s/g, '');
    if (!p) continue;
    counts[p] = (counts[p] ?? 0) + 1;
  }

  return (
    <CommandesView
      initialOrders={items}
      total={total}
      totalPages={totalPages}
      page={page}
      repeatCounts={counts}
      tabCounts={tabCounts}
      statusCounts={statusCountsMap}
    />
  );
}

