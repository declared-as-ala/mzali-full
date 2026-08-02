'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { AlertTriangle, Trash2, Info, X } from 'lucide-react';

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: 'danger' | 'warning' | 'info';
};

type ConfirmContextType = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmContextType>(async () => false);

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmModalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    open: boolean;
    options: ConfirmOptions;
    resolve: (val: boolean) => void;
  } | null>(null);

  const confirm = useCallback((opts: ConfirmOptions | string) => {
    return new Promise<boolean>((resolve) => {
      const options: ConfirmOptions = typeof opts === 'string' ? { title: opts } : opts;
      setState({ open: true, options, resolve });
    });
  }, []);

  const handleClose = (result: boolean) => {
    if (state) {
      state.resolve(result);
      setState(null);
    }
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state?.open && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => handleClose(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-2xl transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <div
                className={`mt-0.5 grid h-12 w-12 shrink-0 place-items-center rounded-2xl border ${
                  state.options.tone === 'info'
                    ? 'bg-blue-50 text-blue-600 border-blue-100'
                    : state.options.tone === 'warning'
                    ? 'bg-amber-50 text-amber-600 border-amber-100'
                    : 'bg-rose-50 text-rose-600 border-rose-100'
                }`}
              >
                {state.options.tone === 'info' ? (
                  <Info size={22} />
                ) : state.options.tone === 'warning' ? (
                  <AlertTriangle size={22} />
                ) : (
                  <Trash2 size={22} />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-black text-slate-900">
                  {state.options.title}
                </h3>
                {state.options.message && (
                  <p className="mt-1.5 text-xs font-semibold leading-relaxed text-slate-600">
                    {state.options.message}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleClose(false)}
                className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-7 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => handleClose(false)}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                {state.options.cancelText ?? 'Annuler'}
              </button>

              <button
                type="button"
                onClick={() => handleClose(true)}
                className={`rounded-2xl px-5 py-2.5 text-xs font-black text-white shadow-lg transition active:scale-98 cursor-pointer ${
                  state.options.tone === 'info'
                    ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
                    : state.options.tone === 'warning'
                    ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                    : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                }`}
              >
                {state.options.confirmText ?? 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
