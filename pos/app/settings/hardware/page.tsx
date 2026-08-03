import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import HardwareSettings from '@/components/HardwareSettings';

export const dynamic = 'force-dynamic';

export default async function HardwareSettingsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!['store_manager', 'admin', 'super_admin'].includes(session.role)) redirect('/till');
  return <HardwareSettings />;
}
