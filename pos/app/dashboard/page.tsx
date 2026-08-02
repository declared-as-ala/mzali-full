import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import Dashboard from '@/components/Dashboard';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  return <Dashboard cashierName={session.name} canEdit={true} />;
}
