import DashboardCommandCenter from '@/components/admin/dashboard/DashboardCommandCenter';
import { getValidAccessToken } from '@/lib/api-auth';
import { getSession } from '@/lib/auth';
import { apiRequest } from '@/services/mzali-api/client';
import type { DashboardStats } from '@/types/dashboard';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

const PROVIDER = process.env.COMMERCE_PROVIDER ?? 'woocommerce';

async function loadMzaliApiStats(): Promise<DashboardStats | null> {
  const bearer = await getValidAccessToken();
  if (!bearer) return null;
  return apiRequest<DashboardStats>('/admin/stats/dashboard', { bearer, query: { days: 30 } }).catch(() => null);
}

export default async function Dashboard() {
  const session = await getSession();
  const role = session?.role as string | undefined;
  const isAdmin = !role || role === 'admin' || role === 'super_admin' || role === 'store_manager';
  if (!isAdmin) {
    redirect('/admin/commandes');
  }

  const stats = PROVIDER === 'mzali-api' ? await loadMzaliApiStats() : null;
  return <DashboardCommandCenter initialDashboard={stats} />;
}
