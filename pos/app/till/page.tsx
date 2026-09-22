import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import Till from '@/components/Till';

export const dynamic = 'force-dynamic';

export default async function TillPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <Till cashierName={session.name} role={session.role} />
    </div>
  );
}
