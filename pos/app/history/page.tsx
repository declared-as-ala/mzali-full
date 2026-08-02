import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import HistoryView from '@/components/HistoryView';

export const dynamic = 'force-dynamic';

/** Editing a completed sale is authorized-users-only (backend permission
 *  pos.edit_sale, granted only to store_manager today) — this client gate
 *  just hides the affordance for other roles; the backend guard is the
 *  real enforcement point regardless. */
export default async function HistoryPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  return <HistoryView canEdit={true} />;
}
