'use client';
import { useEffect, useRef, useState } from 'react';

type Props = {
  productId: string;
  productName: string;
  locationId: 'DEPOT' | 'BOUTIQUE';
  /** Total stock that will be aggregated into the global quantity. */
  variantTotalOnHand: number;
  onClose: (switched: boolean) => void;
};

export default function SwitchToSimpleModal({ productId, productName, locationId, variantTotalOnHand, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('Passage au stock global');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { dialog.current?.showModal(); }, []);

  const locationLabel = locationId === 'BOUTIQUE' ? 'Boutique' : 'Dépôt';

  async function confirm() {
    if (!reason.trim()) { setError('Motif obligatoire'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/variant-stock/products/${productId}/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: locationId, mode: 'SIMPLE', reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erreur lors du changement de mode');
      onClose(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors du changement de mode');
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      onCancel={(e) => { if (saving) e.preventDefault(); else onClose(false); }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-2xl border p-0 shadow-2xl backdrop:bg-slate-900/50"
    >
      <header className="flex items-center justify-between gap-3 border-b bg-white p-4">
        <h2 className="text-lg font-black">Passer au stock global</h2>
        <button type="button" className="btn-ghost" disabled={saving} onClick={() => onClose(false)}>✕</button>
      </header>

      <div className="space-y-5 p-5">
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900">
            Le stock des variantes {locationLabel} sera regroupé en une seule quantité globale.
          </p>
          <p className="mt-1 text-sm text-amber-800">
            Les mouvements historiques sont conservés. Cette action ne supprime aucune donnée.
          </p>
        </div>

        <div className="rounded-xl border bg-slate-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-600">Stock total des variantes</span>
            <span className="text-xl font-black text-ink-900">{variantTotalOnHand}</span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t pt-3">
            <span className="text-sm font-bold text-ink-700">Nouveau stock global {locationLabel}</span>
            <span className="text-xl font-black text-blue-700">{variantTotalOnHand}</span>
          </div>
        </div>

        <div>
          <label htmlFor="switch-simple-reason" className="block text-sm font-bold text-ink-700">Motif</label>
          <input
            id="switch-simple-reason"
            type="text"
            className="input mt-1 w-full"
            value={reason}
            disabled={saving}
            onChange={e => setReason(e.target.value)}
          />
        </div>

        <p className="text-xs text-ink-500">
          <strong>{productName}</strong> · {locationLabel}
        </p>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            id={`switch-simple-confirm-${productId}`}
            className="btn-primary flex-1 bg-amber-600 hover:bg-amber-700"
            disabled={saving || !reason.trim()}
            onClick={() => void confirm()}
          >
            {saving ? 'Enregistrement…' : 'Confirmer le regroupement'}
          </button>
          <button type="button" className="btn-ghost" disabled={saving} onClick={() => onClose(false)}>Annuler</button>
        </div>
      </div>
    </dialog>
  );
}
