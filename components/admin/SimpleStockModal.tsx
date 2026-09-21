'use client';
import { useEffect, useRef, useState } from 'react';

type Props = {
  productId: string;
  productName: string;
  locationId: 'DEPOT' | 'BOUTIQUE';
  currentOnHand: number;
  currentReserved: number;
  /** For DEPOT SIMPLE: the single non-pool variantId to adjust. */
  depotVariantId?: string;
  onClose: (saved: boolean) => void;
};

export default function SimpleStockModal({ productId, productName, locationId, currentOnHand, currentReserved, depotVariantId, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [quantity, setQuantity] = useState(currentOnHand);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { dialog.current?.showModal(); }, []);

  const delta = quantity - currentOnHand;
  const isValid = Number.isSafeInteger(quantity) && quantity >= 0 && quantity >= currentReserved;

  async function save() {
    if (!isValid || delta === 0) return;
    setSaving(true);
    setError('');
    try {
      let res: Response;
      if (locationId === 'BOUTIQUE') {
        // BOUTIQUE SIMPLE: consolidated pool via /boutique endpoint
        res = await fetch(`/api/admin/variant-stock/products/${productId}/boutique`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quantity, expectedQuantity: currentOnHand }),
        });
      } else {
        // DEPOT SIMPLE: use the adjust endpoint with the legacy variantId
        const vid = depotVariantId;
        if (!vid) throw new Error('Variante introuvable — actualisez la page.');
        res = await fetch('/api/admin/variant-stock/adjust', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ variantId: vid, locationId: 'DEPOT', qty: delta, reason: note.trim() || 'Ajustement stock Dépôt' }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Enregistrement impossible');
      onClose(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  }

  const locationLabel = locationId === 'BOUTIQUE' ? 'Boutique' : 'Dépôt';

  return (
    <dialog
      ref={dialog}
      onCancel={(e) => { if (saving) e.preventDefault(); else onClose(false); }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-sm overflow-y-auto rounded-2xl border p-0 shadow-2xl backdrop:bg-slate-900/50"
    >
      <header className="flex items-center justify-between gap-3 border-b bg-white p-4">
        <div>
          <h2 className="text-lg font-black">{productName}</h2>
          <p className="text-sm text-ink-500">
            Stock {locationLabel} ·{' '}
            {locationId === 'DEPOT' ? (
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-700">VARIANTE</span>
            ) : (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">GLOBAL</span>
            )}
          </p>
        </div>
        <button type="button" className="btn-ghost" disabled={saving} onClick={() => onClose(false)}>✕</button>
      </header>

      <div className="space-y-5 p-5">
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}

        <div className="rounded-xl border bg-slate-50 p-4 text-center">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Stock actuel</p>
          <p className="mt-1 text-4xl font-black text-ink-900">{currentOnHand}</p>
          {currentReserved > 0 && (
            <p className="mt-1 text-xs text-ink-500">{currentReserved} réservé(s) · minimum {currentReserved}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-bold text-ink-700">Nouvelle quantité</label>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-xl border bg-white text-xl font-bold hover:bg-slate-100 disabled:opacity-40"
              disabled={saving || quantity <= Math.max(0, currentReserved)}
              onClick={() => setQuantity(q => Math.max(Math.max(0, currentReserved), q - 1))}
              aria-label="Diminuer"
            >−</button>
            <input
              type="number"
              min={Math.max(0, currentReserved)}
              step={1}
              className="input w-24 text-center text-xl font-bold"
              value={quantity}
              disabled={saving}
              onFocus={e => e.target.select()}
              onChange={e => setQuantity(Math.max(0, Number(e.target.value)))}
            />
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-xl border bg-white text-xl font-bold hover:bg-slate-100 disabled:opacity-40"
              disabled={saving}
              onClick={() => setQuantity(q => q + 1)}
              aria-label="Augmenter"
            >+</button>
          </div>
          {delta !== 0 && (
            <p className={`mt-2 text-sm font-bold ${delta > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {delta > 0 ? `+${delta}` : `${delta}`} unité{Math.abs(delta) > 1 ? 's' : ''}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-bold text-ink-700">
            Note {locationId === 'DEPOT' ? '(obligatoire pour Dépôt)' : '(optionnel)'}
          </label>
          <input
            id={`simple-stock-note-${productId}`}
            type="text"
            className="input mt-1 w-full"
            placeholder="Ex. : Réception marchandise, Correction inventaire…"
            value={note}
            disabled={saving}
            onChange={e => setNote(e.target.value)}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            id={`simple-stock-save-${productId}`}
            className="btn-primary flex-1"
            disabled={saving || !isValid || delta === 0 || (locationId === 'DEPOT' && !note.trim())}
            onClick={() => void save()}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={saving}
            onClick={() => onClose(false)}
          >
            Annuler
          </button>
        </div>
      </div>
    </dialog>
  );
}
