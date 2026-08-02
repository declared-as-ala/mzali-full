import Sidebar from '@/components/admin/Sidebar';
import { ToastProvider } from '@/components/admin/Toast';
import { ConfirmModalProvider } from '@/components/admin/ConfirmModal';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect('/admin-login?from=/admin');
  }

  return (
    <ToastProvider>
      <ConfirmModalProvider>
        <div className="flex h-screen w-screen overflow-hidden bg-[#0A0D14] text-slate-900 font-sans antialiased">
          <Sidebar role={session.role} />
          <main className="relative flex-1 overflow-y-auto overflow-x-hidden bg-[#F4F6F9] min-h-screen">
            {children}
          </main>
        </div>
      </ConfirmModalProvider>
    </ToastProvider>
  );
}
