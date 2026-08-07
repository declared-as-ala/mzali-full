'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, LayoutDashboard, History, Settings } from 'lucide-react';

const TABS = [
  { href: '/till', label: 'Caisse', icon: LayoutGrid },
  { href: '/history', label: 'Commandes', icon: History },
  { href: '/dashboard', label: 'Rapports', icon: LayoutDashboard },
  { href: '/settings', label: 'Réglages', icon: Settings },
];

/** Shared navigation strip across the three POS pages (till/dashboard/
 *  history) — deliberately minimal (no logout/session controls, those stay
 *  on Till's own header) so it can be dropped into any page's header
 *  without duplicating session-management logic. */
export default function NavBar() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1.5">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
              active
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            <Icon size={14} />
            <span className="hidden sm:inline">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
