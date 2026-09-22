'use client';
import { useState } from 'react';
import { Menu } from 'lucide-react';
import MobileSidebar from './MobileSidebar';

export default function MobileHeader({ role }: { role?: string }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <header className="lg:hidden sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-black text-white">
            M
          </div>
          <span className="text-sm font-bold text-slate-900">Mzali Store</span>
        </div>
        <button
          onClick={() => setDrawerOpen(true)}
          className="grid h-10 w-10 place-items-center rounded-xl text-slate-700 hover:bg-slate-100 active:scale-95 transition"
          aria-label="Ouvrir le menu"
        >
          <Menu size={20} />
        </button>
      </header>
      <MobileSidebar role={role} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
