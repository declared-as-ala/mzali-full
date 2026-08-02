'use client';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { Check, AlertTriangle, X, Info } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';
type Toast = { id: number; kind: ToastKind; message: string };

type Ctx = {
  push: (kind: ToastKind, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastCtx = createContext<Ctx | null>(null);

let idSeq = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = idSeq++;
    setItems((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const ctx: Ctx = {
    push,
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  };

  return (
    <ToastCtx.Provider value={ctx}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex max-w-sm flex-col gap-2">
        {items.map((t) => <ToastItem key={t.id} t={t} onDismiss={() => setItems((p) => p.filter((x) => x.id !== t.id))} />)}
      </div>
    </ToastCtx.Provider>
  );
}

function ToastItem({ t, onDismiss }: { t: Toast; onDismiss: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { const r = requestAnimationFrame(() => setOpen(true)); return () => cancelAnimationFrame(r); }, []);
  const tone =
    t.kind === 'success' ? 'bg-emerald-500 text-white' :
    t.kind === 'error'   ? 'bg-red-500 text-white' :
                           'bg-brand-500 text-white';
  const Icon = t.kind === 'success' ? Check : t.kind === 'error' ? AlertTriangle : Info;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto flex items-start gap-3 rounded-2xl ${tone} px-4 py-3 shadow-2xl transition-all duration-200 ${open ? 'translate-x-0 opacity-100' : 'translate-x-6 opacity-0'}`}
    >
      <Icon size={18} className="mt-0.5 flex-none" />
      <p className="flex-1 text-sm font-bold leading-snug">{t.message}</p>
      <button onClick={onDismiss} className="rounded-md p-0.5 hover:bg-white/20" aria-label="Fermer"><X size={14} /></button>
    </div>
  );
}

export function useToast(): Ctx {
  const ctx = useContext(ToastCtx);
  if (!ctx) {
    // Graceful no-op when used outside a provider
    return { push: () => {}, success: () => {}, error: () => {}, info: () => {} };
  }
  return ctx;
}
