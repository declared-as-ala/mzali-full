'use client';
import Link from 'next/link';
import StockColorSizeTable from './StockColorSizeTable';
import SwitchToSimpleModal from './SwitchToSimpleModal';
import SwitchToVariantModal from './SwitchToVariantModal';
import { useCallback, useEffect, useState } from 'react';
import { useAdminHref } from '@/lib/admin-nav-context';
import { productStockRows, stockCombinationKey, type StockOption, type StockRow } from '@/lib/product-stock-options';

type Variant = { id: string; sku: string; attributes: Record<string, string>; active: boolean; retired: boolean; stock: { locationId: string; onHand: number; reserved: number }[] };
type Config = {
  boutique: { onHand: number; reserved: number };
  options: StockOption[];
  model: string;
  depotTrackingMode: 'SIMPLE' | 'VARIANT';
  boutiqueTrackingMode: 'SIMPLE' | 'VARIANT';
  variants: Variant[];
};

type ModeSwitch = { type: 'toSimple' | 'toVariant' } | null;

export default function VariantMatrix({ productId, onBusyChange, initialLocation = 'DEPOT' }: { productId: string; onBusyChange?: (busy: boolean) => void; initialLocation?: 'DEPOT' | 'BOUTIQUE' }) {
  const href = useAdminHref();
  const [boutiqueQuantity, setBoutiqueQuantity] = useState(0);
  const [config, setConfig] = useState<Config | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<StockRow[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [modeSwitch, setModeSwitch] = useState<ModeSwitch>(null);
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/variant-stock/products/${productId}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Chargement impossible');
    setConfig(data);
    setBoutiqueQuantity(data.boutique?.onHand ?? 0);
    setQuantities({});
    setRows(previous => productStockRows(productId, data.options ?? [], previous));
  }, [productId]);

  useEffect(() => {
    setConfig(null); setRows([]); setError(''); setMessage('');
    void load().catch(e => setError(e.message));
  }, [load]);

  const total = (location: string) => config?.variants.flatMap(v => v.stock).filter(s => s.locationId === location).reduce((sum, s) => sum + s.onHand, 0) ?? 0;
  const allocated = (key: 'depot' | 'boutique') => rows.reduce((sum, row) => sum + row[key], 0);
  const remainingBoutique = total('BOUTIQUE') - allocated('boutique');
  const initialStock = total('DEPOT') === 0 && total('BOUTIQUE') === 0;
  const valid = rows.length > 0 && remainingBoutique === 0 && rows.every(r => [r.depot, r.boutique].every(q => Number.isSafeInteger(q) && q >= 0));
  const current = config?.variants.filter(v => !v.retired) ?? [];
  const missing = rows.filter(r => !current.some(v => stockCombinationKey(v.attributes.size ?? '', v.attributes.color ?? '') === stockCombinationKey(r.size, r.color)));

  async function save(add = false) {
    setBusy(true); setError(''); setMessage('');
    const body = { initialStock: !add && initialStock, replaceDepotStock: !add, rows: (add ? missing : rows).map(r => ({ ...r, sellingPriceMinor: null })), reason: add ? 'Ajout des options enregistrées du produit' : initialStock ? 'Premier stock reçu au Dépôt' : 'Stock saisi par taille et couleur (remplacement du total historique)' };
    try {
      const url = `/api/admin/variant-stock/products/${productId}${add ? '/add' : ''}`;
      for (const dryRun of [true, false]) {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, dryRun }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Enregistrement impossible');
      }
      await load(); setMessage('Stock enregistré.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Enregistrement impossible'); }
    finally { setBusy(false); }
  }

  const stockQuantity = (v: Variant) => v.stock.find(s => s.locationId === initialLocation)?.onHand ?? 0;
  const changes = current.filter(v => quantities[v.id] !== undefined && quantities[v.id] !== stockQuantity(v));
  async function saveQuantities() {
    setBusy(true); setError(''); setMessage('');
    try {
      const res = await fetch(`/api/admin/variant-stock/products/${productId}/quantities`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locationId: initialLocation, rows: changes.map(v => ({ variantId: v.id, expectedQuantity: stockQuantity(v), quantity: quantities[v.id] })) }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error ?? 'Enregistrement impossible');
      await load(); setMessage('Stock enregistré.');
    } catch(e) { setError(e instanceof Error ? e.message : 'Enregistrement impossible'); } finally { setBusy(false); }
  }

  async function saveBoutique() {
    setBusy(true); setError(''); setMessage('');
    try {
      const res = await fetch(`/api/admin/variant-stock/products/${productId}/boutique`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity: boutiqueQuantity, expectedQuantity: config?.boutique.onHand ?? 0 }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error ?? 'Enregistrement impossible');
      await load(); setMessage('Stock Boutique enregistré.');
    } catch(e) { setError(e instanceof Error ? e.message : 'Enregistrement impossible'); } finally { setBusy(false); }
  }

  async function toggle(v: Variant) {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/admin/inventory/variants/${v.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !v.active }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Modification impossible');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Modification impossible'); }
    finally { setBusy(false); }
  }

  /* ── Tracking mode helpers ────────────────────────────────────────── */
  const currentTrackingMode = initialLocation === 'BOUTIQUE'
    ? (config?.boutiqueTrackingMode ?? 'SIMPLE')
    : (config?.depotTrackingMode ?? 'SIMPLE');

  const boutiqueVariantTotal = current.reduce((s, v) => {
    const stockItem = v.stock.find(si => si.locationId === 'BOUTIQUE');
    return s + (stockItem?.onHand ?? 0);
  }, 0);

  /* ── Mode toggle UI (BOUTIQUE only) ──────────────────────────────── */
  function ModeToggle() {
    if (initialLocation !== 'BOUTIQUE' || !config) return null;
    const isVariant = currentTrackingMode === 'VARIANT';
    return (
      <div className="rounded-xl border bg-white p-4">
        <p className="mb-3 text-sm font-bold text-ink-700">Mode de gestion du stock Boutique</p>
        <div className="flex gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name={`boutique-mode-${productId}`}
              checked={!isVariant}
              disabled={busy}
              onChange={() => {
                if (isVariant) setModeSwitch({ type: 'toSimple' });
              }}
            />
            <span>
              <span className="font-bold">Stock global</span>
              <span className="ml-1 text-ink-500">— une quantité totale</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name={`boutique-mode-${productId}`}
              checked={isVariant}
              disabled={busy || config.depotTrackingMode !== 'VARIANT'}
              onChange={() => {
                if (!isVariant) setModeSwitch({ type: 'toVariant' });
              }}
            />
            <span>
              <span className="font-bold">Taille &amp; couleur</span>
              <span className="ml-1 text-ink-500">— stock par variante</span>
              {config.depotTrackingMode !== 'VARIANT' && (
                <span className="ml-1 text-xs text-amber-700">(Dépôt en mode Variantes requis)</span>
              )}
            </span>
          </label>
        </div>
      </div>
    );
  }

  /* ── Boutique SIMPLE view ─────────────────────────────────────────── */
  function BoutiqueSimpleView() {
    return (
      <div className="space-y-4 rounded-xl border bg-blue-50 p-5">
        <label className="block text-sm font-bold">Quantité totale en Boutique
          <input className="input mt-2 text-xl font-bold" type="number" min={config!.boutique.reserved} step={1} value={boutiqueQuantity} disabled={busy} onFocus={e => e.target.select()} onChange={e => setBoutiqueQuantity(Number(e.target.value))} />
        </label>
        <p className="text-sm">Stock actuel : {config!.boutique.onHand} · Réservé : {config!.boutique.reserved}</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy || !Number.isSafeInteger(boutiqueQuantity) || boutiqueQuantity < config!.boutique.reserved} onClick={() => void saveBoutique()}>Enregistrer le stock</button>
          <button className="btn-ghost" disabled={busy} onClick={() => void load().catch(e => setError(e.message))}>Actualiser</button>
        </div>
      </div>
    );
  }

  /* ── Boutique VARIANT view ────────────────────────────────────────── */
  function BoutiqueVariantView() {
    return (
      <>
        <StockColorSizeTable label="Stock Boutique" disabled={busy} cells={current.map(v => ({ size: v.attributes.size ?? '', color: v.attributes.color ?? '', quantity: quantities[v.id] ?? stockQuantity(v) }))} onChange={(size, color, quantity) => { const variant = current.find(v => stockCombinationKey(v.attributes.size ?? '', v.attributes.color ?? '') === stockCombinationKey(size, color)); if (variant) setQuantities(previous => ({ ...previous, [variant.id]: quantity })); }} />
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy || !changes.length || changes.some(v => !Number.isSafeInteger(quantities[v.id]) || quantities[v.id] < 0)} onClick={() => void saveQuantities()}>{busy ? 'Enregistrement…' : 'Enregistrer le stock'}</button>
          <button className="btn-ghost" disabled={busy} onClick={() => void load().catch(e => setError(e.message))}>Actualiser les quantités</button>
        </div>
      </>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-lg font-black">{initialLocation === 'BOUTIQUE' ? 'Stock Boutique du produit' : 'Stock par taille et couleur'}</h3>
        <p className="mt-1 text-sm text-ink-500">{initialLocation === 'BOUTIQUE' ? 'Gestion du stock pour la caisse POS.' : 'Toutes les combinaisons de vos options sont affichées automatiquement.'}</p>
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}

      {!config ? (!error && <p>Chargement…</p>) : (
        <>
          {initialLocation === 'BOUTIQUE' && <ModeToggle />}

          {initialLocation === 'BOUTIQUE' ? (
            currentTrackingMode === 'VARIANT' ? <BoutiqueVariantView /> : <BoutiqueSimpleView />
          ) : config.model === 'MATRIX' ? (
            <>
              <StockColorSizeTable label="Stock" disabled={busy} cells={current.map(v => ({ size: v.attributes.size ?? '', color: v.attributes.color ?? '', quantity: quantities[v.id] ?? stockQuantity(v) }))} onChange={(size, color, quantity) => { const variant = current.find(v => stockCombinationKey(v.attributes.size ?? '', v.attributes.color ?? '') === stockCombinationKey(size, color)); if (variant) setQuantities(previous => ({ ...previous, [variant.id]: quantity })); }} />
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" disabled={busy || !changes.length || changes.some(v => !Number.isSafeInteger(quantities[v.id]) || quantities[v.id] < 0)} onClick={() => void saveQuantities()}>{busy ? 'Enregistrement…' : 'Enregistrer le stock'}</button>
                <button className="btn-ghost" disabled={busy} onClick={() => void load().catch(e => setError(e.message))}>Actualiser les quantités</button>
              </div>
              <details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm font-bold">Disponibilité à la vente</summary><div className="mt-3 flex flex-wrap gap-3">{current.map(v => <label key={v.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.active} disabled={busy} onChange={() => void toggle(v)} />{v.attributes.color} / {v.attributes.size}</label>)}</div></details>
              <div className="flex flex-wrap gap-2"><Link className="btn-ghost" href={href('/transfers')}>Transférer vers la Boutique</Link></div>
              {missing.length > 0 && <button type="button" className="btn-primary" disabled={busy} onClick={() => void save(true)}>Ajouter les {missing.length} nouvelles combinaisons des options</button>}
            </>
          ) : rows.length === 0 ? (
            <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Ajoutez les tailles et les couleurs dans l'onglet Options, enregistrez le produit, puis revenez ici.</p>
          ) : (
            <>
              <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900"><p className="font-bold">Stock calculé depuis vos variantes</p><p className="mt-1">Saisissez le stock réel de chaque taille et couleur. Le total sera la somme des quantités saisies et remplacera l'ancien stock. Pour approvisionner la Boutique, utilisez ensuite Transferts.</p></div>
              {(total('BOUTIQUE') === 0 ? ['depot'] as const : ['depot', 'boutique'] as const).map(key => <StockColorSizeTable key={key} label={key === 'depot' ? 'Stock' : 'Stock Boutique existant'} disabled={busy} cells={rows.map(r => ({ size: r.size, color: r.color, quantity: r[key] }))} onChange={(size, color, quantity) => setRows(previous => previous.map(row => stockCombinationKey(row.size, row.color) === stockCombinationKey(size, color) ? { ...row, [key]: quantity } : row))} />)}
              <div className="sticky bottom-0 space-y-3 rounded-xl border bg-white p-4 shadow-sm"><p aria-live="polite" className={`text-sm font-bold ${valid ? 'text-emerald-700' : 'text-amber-800'}`}>{`Total stock : ${allocated('depot')} pièces`}</p>{remainingBoutique !== 0 && <p className="text-sm text-amber-800">Stock Boutique existant à répartir : {remainingBoutique} pièces. Le total Boutique reste inchangé.</p>}<button type="button" className="btn-primary w-full sm:w-auto" disabled={busy || !valid} onClick={() => void save()}>{busy ? 'Enregistrement…' : 'Enregistrer le stock'}</button></div>
            </>
          )}
        </>
      )}

      {/* ── Mode switch modals ─────────────────────────────────────────── */}
      {modeSwitch?.type === 'toSimple' && config && (
        <SwitchToSimpleModal
          productId={productId}
          productName={config.variants[0] ? productId : productId}
          locationId="BOUTIQUE"
          variantTotalOnHand={boutiqueVariantTotal}
          onClose={(switched) => {
            setModeSwitch(null);
            if (switched) { void load().catch(e => setError(e.message)); setMessage('Mode stock global activé.'); }
          }}
        />
      )}
      {modeSwitch?.type === 'toVariant' && config && (
        <SwitchToVariantModal
          productId={productId}
          productName={productId}
          locationId="BOUTIQUE"
          currentGlobalQty={config.boutique.onHand}
          variants={current.map(v => ({ id: v.id, attributes: v.attributes }))}
          onClose={(switched) => {
            setModeSwitch(null);
            if (switched) { void load().catch(e => setError(e.message)); setMessage('Mode stock par variante activé.'); }
          }}
        />
      )}
    </section>
  );
}
