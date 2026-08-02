'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, ShoppingCart, LogOut } from 'lucide-react';

const items = [
  { href: '/employee', label: 'Mon tableau', icon: LayoutDashboard, exact: true },
  { href: '/employee/commandes', label: 'Mes commandes', icon: ShoppingCart },
];

export default function EmployeeSidebar({ name }: { name: string }) {
  const path = usePathname();
  const router = useRouter();
  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/admin-login');
  }
  return (
    <aside className="flex h-screen w-64 flex-col bg-gradient-to-b from-brand-700 to-brand-900 p-4 text-white">
      <div className="mb-8 flex items-center gap-3 p-2">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-xl font-black text-brand-700">
          {name?.[0]?.toUpperCase() ?? 'E'}
        </div>
        <div>
          <strong className="block">{name}</strong>
          <small className="text-brand-200">Espace employé</small>
        </div>
      </div>
      <nav className="flex-1 space-y-1">
        {items.map((it) => {
          const active = it.exact ? path === it.href : path.startsWith(it.href);
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 font-bold transition ${
                active ? 'bg-white text-brand-700' : 'text-white hover:bg-white/10'
              }`}
            >
              <Icon size={18} /> {it.label}
            </Link>
          );
        })}
      </nav>
      <button onClick={logout} className="flex items-center gap-3 rounded-xl px-4 py-3 font-bold text-white/80 hover:bg-white/10">
        <LogOut size={18} /> Déconnexion
      </button>
    </aside>
  );
}
