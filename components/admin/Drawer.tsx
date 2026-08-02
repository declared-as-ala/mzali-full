'use client';
import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  width?: string; // tailwind max-w-*
};

export default function Drawer({ open, onClose, title, actions, children, width = 'max-w-[1180px]' }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-slate-900/45 transition-opacity duration-200 ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
      />
      <aside
        className={`fixed right-0 top-0 z-50 flex h-screen w-full ${width} translate-x-full flex-col bg-ink-100 shadow-2xl transition-transform duration-200 ${open ? '!translate-x-0' : ''}`}
      >
        <header className="flex items-center justify-between gap-4 border-b border-ink-200 bg-white px-6 py-4">
          <h2 className="text-lg font-black text-ink-900 md:text-xl">{title}</h2>
          <div className="flex items-center gap-2">
            {actions}
            <button onClick={onClose} aria-label="Fermer" className="grid h-10 w-10 place-items-center rounded-xl bg-ink-100 hover:bg-ink-200">
              <X size={18} />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </aside>
    </>
  );
}
