import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import PosProductsView from '@/components/PosProductsView';

export const dynamic = 'force-dynamic';

export default async function PosProductsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return <PosProductsView cashierName={session.name} role={session.role} />;
}

