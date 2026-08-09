'use client';

import { AlertTriangle, X } from 'lucide-react';

type Props = {
  open: boolean;
  title: string;
  message: string;
  label: string;
  placeholder: string;
  examples?: string[];
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  confirmText?: string;
  cancelText?: string;
  confirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Controlled modal for collecting a mandatory modification reason when
 *  editing an already-confirmed order. Same visual language as ConfirmModal
 *  (fixed overlay, card, tone icon) but with a required textarea + inline
 *  validation instead of a plain boolean prompt — never a native alert. */
export default function ReasonModal({
  open,
  title,
  message,
  label,
  placeholder,
  examples,
  value,
  onChange,
  error,
  confirmText = 'Confirmer la modification',
  cancelText = 'Annuler',
  confirming = false,
  onCancel,
  onConfirm,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] grid place-items-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => { if (!confirming) onCancel(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reason-modal-title"
        className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <div className="mt-0.5 grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-amber-100 bg-amber-50 text-amber-600">
            <AlertTriangle size={22} />
          </div>

          <div className="min-w-0 flex-1">
            <h3 id="reason-modal-title" className="text-lg font-black text-slate-900">{title}</h3>
            <p className="mt-1.5 text-xs font-semibold leading-relaxed text-slate-600">{message}</p>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-6">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-700">{label}</span>
            <textarea
              autoFocus
              rows={4}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              disabled={confirming}
              className={`w-full resize-none rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 ${
                error
                  ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-50'
                  : 'border-slate-200 focus:border-brand-500 focus:ring-brand-50'
              }`}
            />
          </label>
          {error && (
            <p className="mt-1.5 text-xs font-bold text-rose-600">{error}</p>
          )}
          {examples && examples.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {examples.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  disabled={confirming}
                  onClick={() => onChange(ex)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-40"
                >
                  {ex}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-7 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="rounded-2xl bg-brand-500 px-5 py-2.5 text-xs font-black text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600 active:scale-98 disabled:opacity-50"
          >
            {confirming ? 'Enregistrement…' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
