import { redirect } from 'next/navigation';
import EmployeeSidebar from '@/components/employee/Sidebar';
import { ToastProvider } from '@/components/admin/Toast';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/admin-login?from=/employee');
  if (session.role !== 'employee' && session.role !== 'admin') {
    redirect('/admin-login?from=/employee');
  }
  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-slate-50">
        <EmployeeSidebar name={session.name || 'Employé'} />
        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </ToastProvider>
  );
}
