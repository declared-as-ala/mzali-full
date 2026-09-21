'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAdminHref } from '@/lib/admin-nav-context';
import { productStockRows, stockCombinationKey, type StockOption, type StockRow } from '@/lib/product-stock-options';

type Variant = { id: string; sku: string; attributes: Record<string, string>; active: boolean; retired: boolean; stock: { locationId: string; onHand: number; reserved: number }[] };
type Config = { options: StockOption[]; model: string; variants: Variant[] };
export default function VariantMatrix({ productId, onBusyChange, initialLocation = 'DEPOT' }: { productId: string; onBusyChange?: (busy: boolean) => void; initialLocation?: 'DEPOT' | 'BOUTIQUE' }) {
  const href = useAdminHref();
  const [config, setConfig] = useState<Config | null>(null);
  const [rows, setRows] = useState<StockRow[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/variant-stock/products/${productId}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Chargement impossible');
    setConfig(data);
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
      // Validation and activation share one simple user action; the backend
      // revalidates quantities atomically during activation.
      for (const dryRun of [true, false]) {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, dryRun }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Enregistrement impossible');
      }
      await load(); setMessage('Stock enregistré.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Enregistrement impossible'); }
    finally { setBusy(false); }
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

  return <section className="space-y-4">
    <div><h3 className="text-lg font-black">Stock par taille et couleur</h3><p className="mt-1 text-sm text-ink-500">Toutes les combinaisons de vos options sont affichées automatiquement. Le prix est celui du produit.</p></div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    {config?.model === 'MATRIX' && current.length > 0 && <StockAdjustment variants={current} location={initialLocation} busy={busy} setBusy={setBusy} onSaved={load} onError={setError} onMessage={setMessage} />}
    {!config ? (!error && <p>Chargement…</p>) : initialLocation === 'BOUTIQUE' ? <p className="rounded-xl bg-blue-50 p-4 text-sm">Vous gérez uniquement le stock Boutique. Pour recevoir des pièces du Dépôt, utilisez <Link className="font-bold underline" href={href('/transfers')}>Transferts</Link>.{config.model !== 'MATRIX' && ' La répartition initiale par taille et couleur se fait depuis Stock.'}</p> : config.model === 'MATRIX' ? <>
      <p className="rounded-xl bg-blue-50 p-3 text-sm font-bold">Dépôt : {total('DEPOT')} · Boutique : {total('BOUTIQUE')}</p>
      <div className="overflow-x-auto rounded-xl border"><table className="w-full text-left text-sm"><thead className="bg-ink-50"><tr>{['Taille', 'Couleur', 'Dépôt', 'Boutique', 'En vente'].map(h => <th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{current.map(v => <tr className="border-t" key={v.id}><td className="p-3 font-bold">{v.attributes.size}</td><td className="p-3">{v.attributes.color}</td><td className="p-3">{v.stock.find(s => s.locationId === 'DEPOT')?.onHand ?? 0}</td><td className="p-3">{v.stock.find(s => s.locationId === 'BOUTIQUE')?.onHand ?? 0}</td><td className="p-3"><input type="checkbox" checked={v.active} disabled={busy} aria-label={`En vente : ${v.attributes.size} ${v.attributes.color}`} onChange={() => void toggle(v)} /></td></tr>)}</tbody></table></div>
      <div className="flex flex-wrap gap-2"><Link className="btn-ghost" href={href('/transfers')}>Transférer vers la Boutique</Link></div>
      {missing.length > 0 && <button type="button" className="btn-primary" disabled={busy} onClick={() => void save(true)}>Ajouter les {missing.length} nouvelles combinaisons des options</button>}
    </> : rows.length === 0 ? <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Ajoutez les tailles et les couleurs dans l’onglet Options, enregistrez le produit, puis revenez ici.</p> : <>
      <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900"><p className="font-bold">Stock calculé depuis vos variantes</p><p className="mt-1">Saisissez le stock réel de chaque taille et couleur. Le total sera la somme des quantités saisies et remplacera l’ancien stock. Pour approvisionner la Boutique, utilisez ensuite Transferts.</p></div>
      <div className="overflow-x-auto rounded-xl border"><table className="w-full text-left text-sm"><thead className="bg-ink-50"><tr>{(total('BOUTIQUE') === 0 ? ['Taille', 'Couleur', 'Quantité en stock'] : ['Taille', 'Couleur', 'Stock', 'Boutique']).map(h => <th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr className="border-t" key={stockCombinationKey(r.size, r.color)}><td className="p-3 font-bold">{r.size}</td><td className="p-3">{r.color}</td>{(total('BOUTIQUE') === 0 ? ['depot'] as const : ['depot', 'boutique'] as const).map(key => <td className="p-2" key={key}><input disabled={busy} aria-label={`${r.size} ${r.color} ${key === 'depot' ? 'Dépôt' : 'Boutique'}`} className="input w-24" type="number" min={0} step={1} value={r[key]} onFocus={e => e.target.select()} onChange={e => setRows(previous => previous.map((row, n) => n === i ? { ...row, [key]: Number(e.target.value) } : row))} /></td>)}</tr>)}</tbody></table></div>
      <div className="sticky bottom-0 space-y-3 rounded-xl border bg-white p-4 shadow-sm"><p aria-live="polite" className={`text-sm font-bold ${valid ? 'text-emerald-700' : 'text-amber-800'}`}>{`Total stock : ${allocated('depot')} pièces`}</p>{remainingBoutique !== 0 && <p className="text-sm text-amber-800">Stock Boutique existant à répartir : {remainingBoutique} pièces. Le total Boutique reste inchangé.</p>}<button type="button" className="btn-primary w-full sm:w-auto" disabled={busy || !valid} onClick={() => void save()}>{busy ? 'Enregistrement…' : 'Enregistrer le stock'}</button></div>
    </>}
  </section>;
}

function StockAdjustment({ variants, location, busy, setBusy, onSaved, onError, onMessage }: { variants: Variant[]; location: 'DEPOT' | 'BOUTIQUE'; busy: boolean; setBusy: (v: boolean) => void; onSaved: () => Promise<void>; onError: (s: string) => void; onMessage: (s: string) => void }) {
  const [variantId, setVariantId] = useState(variants[0]?.id ?? '');
  const locationId = location;
  const [qty, setQty] = useState('');
  const selected = variants.find(v => v.id === variantId) ?? variants[0];
  const stock = selected?.stock.find(s => s.locationId === locationId);
  async function save() {
    setBusy(true); onError(''); onMessage('');
    try {
      const res = await fetch('/api/admin/variant-stock/adjust', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variantId: selected.id, locationId, qty: Number(qty), reason: `Ajustement manuel du stock ${locationId === 'DEPOT' ? 'Dépôt' : 'Boutique'}` }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error ?? 'Ajustement impossible');
      await onSaved(); setQty(''); onMessage('Stock ajusté.');
    } catch(e) { onError(e instanceof Error ? e.message : 'Ajustement impossible'); } finally { setBusy(false); }
  }
  return <fieldset disabled={busy} className="space-y-3 rounded-xl bg-blue-50 p-4"><legend className="sr-only">Ajuster le stock</legend><h4 className="font-bold">Ajouter ou retirer des pièces</h4><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Taille / couleur<select className="input mt-1" value={selected?.id ?? ''} onChange={e => setVariantId(e.target.value)}>{variants.map(v => <option key={v.id} value={v.id}>{[v.attributes.size, v.attributes.color].filter(Boolean).join(' / ') || 'Stock total du produit'}</option>)}</select></label><div className="text-sm">Emplacement<p className="mt-1 rounded-xl border bg-white p-3 font-bold">{locationId === 'DEPOT' ? 'Dépôt' : 'Boutique'}</p></div><label className="text-sm">Quantité à ajouter (+) ou retirer (−)<input className="input mt-1" type="number" step={1} value={qty} onChange={e => setQty(e.target.value)} placeholder="Ex. 20 ou -5" /></label></div><p className="text-sm">Stock actuel : <strong>{stock?.onHand ?? 0}</strong>{Number.isSafeInteger(Number(qty)) && qty !== '' && <> → Après ajustement : <strong>{(stock?.onHand ?? 0) + Number(qty)}</strong></>}</p><button type="button" onClick={() => void save()} disabled={busy || !selected || !Number.isSafeInteger(Number(qty)) || !Number(qty)} className="btn-primary">Enregistrer l’ajustement</button></fieldset>;
}
