'use client';
import { useEffect, useRef, useState } from 'react';

type Variant = { id: string; attributes: { size?: string; color?: string } };

type Props = {
  productId: string;
  productName: string;
  locationId: 'BOUTIQUE';  // Only BOUTIQUE supports SIMPLE→VARIANT via this modal
  currentGlobalQty: number;
  variants: Variant[];
  onClose: (switched: boolean) => void;
};

export default function SwitchToVariantModal({ productId, productName, locationId, currentGlobalQty, variants, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('Passage au stock par taille et couleur');
  const [distribution, setDistribution] = useState<Record<string, number>>(
    Object.fromEntries(variants.map(v => [v.id, 0])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { dialog.current?.showModal(); }, []);

  const totalDistributed = Object.values(distribution).reduce((s, n) => s + (Number.isSafeInteger(n) ? n : 0), 0);
  const remaining = currentGlobalQty - totalDistributed;
  const isValid = remaining === 0 && !reason.trim() === false && Object.values(distribution).every(n => Number.isSafeInteger(n) && n >= 0);

  // If no stock to distribute, always valid
  const canConfirm = currentGlobalQty === 0 || isValid;

  async function confirm() {
    if (!reason.trim()) { setError('Motif obligatoire'); return; }
    if (currentGlobalQty > 0 && remaining !== 0) { setError(`Répartissez exactement ${currentGlobalQty} unités. Reste : ${remaining}`); return; }
    setSaving(true);
    setError('');
    try {
      const dist = currentGlobalQty > 0
        ? variants.map(v => ({ variantId: v.id, qty: distribution[v.id] ?? 0 }))
        : [];
      const res = await fetch(`/api/admin/variant-stock/products/${productId}/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: locationId, mode: 'VARIANT', reason: reason.trim(), distribution: dist }),
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

  const locationLabel = 'Boutique';

  return (
    <dialog
      ref={dialog}
      onCancel={(e) => { if (saving) e.preventDefault(); else onClose(false); }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-2xl border p-0 shadow-2xl backdrop:bg-slate-900/50"
    >
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-white p-4">
        <div>
          <h2 className="text-lg font-black">Répartir le stock {locationLabel}</h2>
          <p className="text-sm text-ink-500">{productName}</p>
        </div>
        <button type="button" className="btn-ghost" disabled={saving} onClick={() => onClose(false)}>✕</button>
      </header>

      <div className="space-y-5 p-5">
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}

        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-bold text-blue-900">
            Le stock global {locationLabel} sera réparti par taille et couleur.
          </p>
          <p className="mt-1 text-sm text-blue-800">
            Les mouvements historiques sont conservés.
          </p>
        </div>

        {currentGlobalQty > 0 ? (
          <>
            <div className="flex items-center justify-between rounded-xl border bg-slate-50 px-4 py-3">
              <span className="text-sm font-bold">Stock actuel à répartir</span>
              <span className="text-xl font-black">{currentGlobalQty}</span>
            </div>

            <div>
              <p className="mb-3 text-sm font-bold text-ink-700">Saisir la quantité par variante</p>
              <div className="space-y-2">
                {variants.map(v => (
                  <div key={v.id} className="flex items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2">
                    <span className="text-sm">
                      <span className="font-bold">{v.attributes.color || '—'}</span>
                      {v.attributes.size && <span className="ml-1 text-ink-500">/ {v.attributes.size}</span>}
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className="input w-20 text-center text-sm"
                      value={distribution[v.id] ?? 0}
                      disabled={saving}
                      onFocus={e => e.target.select()}
                      onChange={e => {
                        const val = Math.max(0, Math.round(Number(e.target.value)));
                        setDistribution(prev => ({ ...prev, [v.id]: val }));
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${remaining === 0 ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
              <span className={`text-sm font-bold ${remaining === 0 ? 'text-emerald-800' : 'text-amber-800'}`}>
                {remaining === 0 ? '✓ Total distribué' : `Reste à répartir`}
              </span>
              <span className={`text-xl font-black ${remaining === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                {remaining === 0 ? `${totalDistributed} / ${currentGlobalQty}` : remaining}
              </span>
            </div>
          </>
        ) : (
          <div className="rounded-xl border bg-slate-50 p-4 text-center text-sm text-ink-500">
            Stock actuel : 0. Aucune répartition nécessaire.
          </div>
        )}

        <div>
          <label htmlFor="switch-variant-reason" className="block text-sm font-bold text-ink-700">Motif</label>
          <input
            id="switch-variant-reason"
            type="text"
            className="input mt-1 w-full"
            value={reason}
            disabled={saving}
            onChange={e => setReason(e.target.value)}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            id={`switch-variant-confirm-${productId}`}
            className="btn-primary flex-1"
            disabled={saving || !canConfirm || !reason.trim()}
            onClick={() => void confirm()}
          >
            {saving ? 'Enregistrement…' : 'Confirmer la répartition'}
          </button>
          <button type="button" className="btn-ghost" disabled={saving} onClick={() => onClose(false)}>Annuler</button>
        </div>
      </div>
    </dialog>
  );
}
