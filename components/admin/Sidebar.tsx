'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, ShoppingCart, Package, Tag, LogOut,
  UserCircle, Users, Contact, Ticket, Boxes, ScrollText,
  MonitorSmartphone, Wallet, ArrowLeftRight, ClipboardList,
  Building2, FileText, FileSignature, Receipt,
  ShieldCheck, Award, AlertTriangle, BarChart3, CreditCard,
  ChevronRight, Sparkles, Store
} from 'lucide-react';

const SECTIONS = [
  {
    label: 'Aperçu',
    items: [
      { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
      { href: '/admin/reports', label: 'Rapports', icon: BarChart3, exact: false },
    ],
  },
  {
    label: 'Ventes',
    items: [
      { href: '/admin/commandes', label: 'Commandes', icon: ShoppingCart, exact: false },
      { href: '/admin/clients', label: 'Clients', icon: Contact, exact: false },
      { href: '/admin/coupons', label: 'Codes promo', icon: Ticket, exact: false },
    ],
  },
  {
    label: 'Catalogue',
    items: [
      { href: '/admin/produits', label: 'Produits', icon: Package, exact: false },
      { href: '/admin/categories', label: 'Catégories', icon: Tag, exact: false },
      { href: '/admin/stock', label: 'Stock', icon: Boxes, exact: false },
      { href: '/admin/transfers', label: 'Transferts', icon: ArrowLeftRight, exact: false },
    ],
  },
  {
    label: 'Équipe',
    items: [
      { href: '/admin/employees', label: 'Employés', icon: Users, exact: false },
      { href: '/admin/journal', label: 'Journal', icon: ScrollText, exact: false },
    ],
  },
  {
    label: 'Point de vente',
    items: [
      { href: '/admin/pos-analytics', label: 'Informations Caisse', icon: MonitorSmartphone, exact: false },
    ],
  },
  {
    label: 'Achats',
    items: [
      { href: '/admin/suppliers', label: 'Fournisseurs', icon: Building2, exact: false },
      { href: '/admin/purchase-orders', label: 'Bons de commande', icon: FileText, exact: false },
    ],
  },
  {
    label: 'Documents',
    items: [
      { href: '/admin/quotes', label: 'Devis', icon: FileSignature, exact: false },
      { href: '/admin/invoices', label: 'Factures', icon: Receipt, exact: false },
      { href: '/admin/invoicing-settings', label: 'Facturation', icon: ShieldCheck, exact: false },
    ],
  },
  {
    label: 'Fidélité',
    items: [
      { href: '/admin/loyalty', label: 'Fidélité', icon: Award, exact: true },
      { href: '/admin/loyalty/cards', label: 'Cartes fidélité', icon: CreditCard, exact: false },
    ],
  },
] as const;

export default function Sidebar({ role }: { role?: string }) {
  const path = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/admin-login');
  }

  const isAdmin = !role || role === 'admin' || role === 'super_admin' || role === 'store_manager';

  // Normal employees only see Commandes and Profil
  const visibleSections = isAdmin
    ? SECTIONS
    : [
        {
          label: 'Ventes',
          items: [{ href: '/admin/commandes', label: 'Commandes', icon: ShoppingCart, exact: false }],
        },
      ];

  return (
    <aside className="flex h-screen w-64 flex-none flex-col border-r border-slate-800/80 bg-slate-900 p-4 text-slate-300 select-none overflow-y-auto custom-scrollbar">
      {/* Brand Header */}
      <div className="mb-6 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-slate-800/90 to-slate-800/40 p-3.5 border border-slate-700/50 shadow-lg">
        <div className="relative grid h-10 w-10 flex-none place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-black text-white shadow-md shadow-blue-500/20">
          M
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
        </div>
        <div className="min-w-0">
          <strong className="block truncate text-sm font-bold text-white tracking-tight">Mzali Store</strong>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
            <Store size={10} className="text-blue-400" /> {isAdmin ? 'Enterprise ERP' : 'Espace Employé'}
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-6">
        {visibleSections.map((section) => (
          <div key={section.label}>
            <p className="mb-2 px-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400/80">
              {section.label}
            </p>
            <div className="space-y-1">
              {section.items.map((it) => {
                const active = it.exact ? path === it.href : path.startsWith(it.href);
                const Icon = it.icon;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    aria-current={active ? 'page' : undefined}
                    className={`group flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold transition-all duration-200 ${
                      active
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20'
                        : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`grid h-7 w-7 flex-none place-items-center rounded-lg transition-colors ${
                          active ? 'bg-white/20 text-white' : 'bg-slate-800/80 text-slate-400 group-hover:text-white'
                        }`}
                      >
                        <Icon size={15} />
                      </span>
                      <span className="truncate">{it.label}</span>
                    </div>
                    {active && <ChevronRight size={13} className="text-white/70" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User Profile & Logout */}
      <div className="mt-6 space-y-1 border-t border-slate-800/80 pt-4">
        <Link
          href="/admin/profile"
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold transition-colors ${
            path.startsWith('/admin/profile')
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
          }`}
        >
          <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-slate-800 text-slate-400">
            <UserCircle size={15} />
          </span>
          <span>Mon Profil</span>
        </Link>

        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors"
        >
          <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-rose-500/10 text-rose-400">
            <LogOut size={15} />
          </span>
          <span>Déconnexion</span>
        </button>
      </div>
    </aside>
  );
}
