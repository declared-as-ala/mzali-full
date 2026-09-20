'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAdminHref } from '@/lib/admin-nav-context';
import { productStockRows, stockCombinationKey, type StockOption, type StockRow } from '@/lib/product-stock-options';

type Variant = { id: string; sku: string; attributes: Record<string, string>; active: boolean; retired: boolean; stock: { locationId: string; onHand: number; reserved: number }[] };
type Config = { options: StockOption[]; model: string; variants: Variant[] };
export default function VariantMatrix({ productId, onBusyChange }: { productId: string; onBusyChange?: (busy: boolean) => void }) {
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
  const remainingDepot = total('DEPOT') - allocated('depot');
  const remainingBoutique = total('BOUTIQUE') - allocated('boutique');
  const initialStock = total('DEPOT') === 0 && total('BOUTIQUE') === 0;
  const valid = rows.length > 0 && (initialStock || (remainingDepot === 0 && remainingBoutique === 0)) && rows.every(r => [r.depot, r.boutique].every(q => Number.isSafeInteger(q) && q >= 0));
  const current = config?.variants.filter(v => !v.retired) ?? [];
  const missing = rows.filter(r => !current.some(v => stockCombinationKey(v.attributes.size ?? '', v.attributes.color ?? '') === stockCombinationKey(r.size, r.color)));

  async function save(add = false) {
    setBusy(true); setError(''); setMessage('');
    const body = { initialStock: !add && initialStock, rows: (add ? missing : rows).map(r => ({ ...r, sellingPriceMinor: null })), reason: add ? 'Ajout des options enregistrées du produit' : initialStock ? 'Premier stock reçu au Dépôt' : 'Répartition du stock par taille et couleur' };
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
    {!config ? (!error && <p>Chargement…</p>) : config.model === 'MATRIX' ? <>
      <p className="rounded-xl bg-blue-50 p-3 text-sm font-bold">Dépôt : {total('DEPOT')} · Boutique : {total('BOUTIQUE')}</p>
      <div className="overflow-x-auto rounded-xl border"><table className="w-full text-left text-sm"><thead className="bg-ink-50"><tr>{['Taille', 'Couleur', 'Dépôt', 'Boutique', 'En vente'].map(h => <th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{current.map(v => <tr className="border-t" key={v.id}><td className="p-3 font-bold">{v.attributes.size}</td><td className="p-3">{v.attributes.color}</td><td className="p-3">{v.stock.find(s => s.locationId === 'DEPOT')?.onHand ?? 0}</td><td className="p-3">{v.stock.find(s => s.locationId === 'BOUTIQUE')?.onHand ?? 0}</td><td className="p-3"><input type="checkbox" checked={v.active} disabled={busy} aria-label={`En vente : ${v.attributes.size} ${v.attributes.color}`} onChange={() => void toggle(v)} /></td></tr>)}</tbody></table></div>
      <div className="flex flex-wrap gap-2"><Link className="btn-ghost" href={href('/stock-depot')}>Modifier le stock Dépôt</Link><Link className="btn-ghost" href={href('/transfers')}>Transférer vers la Boutique</Link></div>
      {missing.length > 0 && <button type="button" className="btn-primary" disabled={busy} onClick={() => void save(true)}>Ajouter les {missing.length} nouvelles combinaisons des options</button>}
    </> : rows.length === 0 ? <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Ajoutez les tailles et les couleurs dans l’onglet Options, enregistrez le produit, puis revenez ici.</p> : <>
      <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900"><p className="font-bold">{initialStock ? 'Premier stock au Dépôt' : `Stock à répartir : Dépôt ${total('DEPOT')} · Boutique ${total('BOUTIQUE')}`}</p><p className="mt-1">Indiquez combien de pièces vous avez pour chaque taille et couleur. Pour approvisionner la Boutique, utilisez ensuite Transferts.</p></div>
      <div className="overflow-x-auto rounded-xl border"><table className="w-full text-left text-sm"><thead className="bg-ink-50"><tr>{(initialStock ? ['Taille', 'Couleur', 'Quantité au Dépôt'] : ['Taille', 'Couleur', 'Dépôt', 'Boutique']).map(h => <th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr className="border-t" key={stockCombinationKey(r.size, r.color)}><td className="p-3 font-bold">{r.size}</td><td className="p-3">{r.color}</td>{(initialStock ? ['depot'] as const : ['depot', 'boutique'] as const).map(key => <td className="p-2" key={key}><input disabled={busy} aria-label={`${r.size} ${r.color} ${key === 'depot' ? 'Dépôt' : 'Boutique'}`} className="input w-24" type="number" min={0} step={1} value={r[key]} onFocus={e => e.target.select()} onChange={e => setRows(previous => previous.map((row, n) => n === i ? { ...row, [key]: Number(e.target.value) } : row))} /></td>)}</tr>)}</tbody></table></div>
      <div className="sticky bottom-0 space-y-3 rounded-xl border bg-white p-4 shadow-sm"><p aria-live="polite" className={`text-sm font-bold ${valid ? 'text-emerald-700' : 'text-amber-800'}`}>{initialStock ? `${allocated('depot')} pièces à ajouter au Dépôt` : valid ? 'Tout le stock est réparti.' : `Reste à répartir : Dépôt ${remainingDepot} · Boutique ${remainingBoutique}`}</p>{!initialStock && (remainingDepot < 0 || remainingBoutique < 0) && <p className="text-sm text-red-700">Les quantités saisies dépassent le stock existant.</p>}<button type="button" className="btn-primary w-full sm:w-auto" disabled={busy || !valid} onClick={() => void save()}>{busy ? 'Enregistrement…' : 'Enregistrer le stock'}</button></div>
    </>}
  </section>;
}
