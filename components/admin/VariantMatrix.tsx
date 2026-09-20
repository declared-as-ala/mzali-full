'use client';
import { useEffect, useState } from 'react';
type Row = { size: string; color: string; sku: string; active: boolean; depot: number; boutique: number; sellingPriceMinor?: number | null; lowStockThreshold?: number | null };
type Config = { options: { label: string; values: string[] }[]; model: string; name: string; legacyStockQuantity: number | null; variants: { id: string; sku: string; attributes: Record<string, string>; active: boolean; retired: boolean; sellingPriceMinor: number | null; lowStockThreshold: number | null; stock: { locationId: string; onHand: number; reserved: number }[] }[] };
export default function VariantMatrix({ productId }: { productId: string }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [sizes, setSizes] = useState('');
  const [colors, setColors] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [reason, setReason] = useState('Allocation initiale validée après comptage');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [newSize, setNewSize] = useState(''), [newColor, setNewColor] = useState(''), [newSku, setNewSku] = useState('');
  const load = async () => { const r = await fetch(`/api/admin/variant-stock/products/${productId}`, { cache: 'no-store' }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setConfig(d);
    const options: Config['options'] = d.options ?? [];
    const sizeOption = options.find(o => /^(taille|tallie|taile|size|sizes|pointure)s?$/i.test(o.label.trim()));
    const colorOption = options.find(o => /^(couleur|color|colour)s?$/i.test(o.label.trim()));
    if (sizeOption) setSizes(sizeOption.values.join(', '));
    if (colorOption) setColors(colorOption.values.join(', '));
  };
  useEffect(() => { void load().catch(e => setMessage(e.message)); }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps
  function generate() {
    const values = (v: string) => [...new Set(v.split(',').map(s => s.trim()).filter(Boolean))];
    setRows(values(sizes).flatMap(size => values(colors).map(color => rows.find(r => r.size === size && r.color === color) ?? ({ size, color, sku: `${productId.slice(-6)}-${size}-${color}`.toUpperCase(), active: true, depot: 0, boutique: 0 }))));
  }
  async function save(dryRun: boolean) {
    setBusy(true); setMessage('');
    try { const res = await fetch(`/api/admin/variant-stock/products/${productId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows, reason, dryRun }) }); const d = await res.json(); if (!res.ok) throw new Error(d.error); setMessage(dryRun ? 'Validation réussie : les totaux sont conservés. Vous pouvez activer.' : 'Stock par variantes activé.'); if (!dryRun) await load(); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Erreur'); } finally { setBusy(false); }
  }
  async function addCombination() {
    setBusy(true); setMessage('');
    try {
      const r = await fetch(`/api/admin/variant-stock/products/${productId}/add`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Nouvelle combinaison', rows: [{ size: newSize, color: newColor, sku: newSku, active: true, depot: 0, boutique: 0 }] }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error); await load(); setNewSize(''); setNewColor(''); setNewSku(''); setMessage('Variante ajoutée à zéro. Ajoutez les quantités vérifiées dans les pages Stock.');
    } catch (e) { setMessage(String(e)); } finally { setBusy(false); }
  }
  const total = (location: string) => config?.variants.flatMap(v => v.stock).filter(s => s.locationId === location).reduce((sum, s) => sum + s.onHand, 0) ?? 0;
  return <section className="space-y-4">
    <h3 className="text-lg font-black">Variantes & stock</h3>
    {message && <p role="status" className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}
    {!config ? <p>Chargement…</p> : config.model === 'MATRIX' ? <>
      <p className="rounded-xl bg-blue-50 p-3 text-sm font-bold">Total : {total('DEPOT') + total('BOUTIQUE')} unités · Dépôt {total('DEPOT')} · Boutique {total('BOUTIQUE')}</p>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Variante', 'SKU', 'Dépôt', 'Boutique', 'Prix DT', 'Seuil', 'Active', ''].map((h,i) => <th className="p-2 text-left" key={i}>{h}</th>)}</tr></thead><tbody>{config.variants.filter(v => !v.retired).map(v => <VariantEditor key={v.id} variant={v} onSaved={load} onMessage={setMessage} />)}</tbody></table></div>
      <p className="text-xs text-ink-500">Prix vide : prix du produit. Seuil vide : seuil du stock ou 3 unités. Les ajustements sont accessibles dans Stock Dépôt / Stock Boutique.</p>
      <fieldset className="rounded-xl border p-4"><legend className="px-2 text-sm font-bold">Ajouter une combinaison</legend><div className="grid gap-2 sm:grid-cols-3"><input aria-label="Nouvelle taille" className="input" placeholder="Taille" value={newSize} onChange={e => setNewSize(e.target.value)} /><input aria-label="Nouvelle couleur" className="input" placeholder="Couleur" value={newColor} onChange={e => setNewColor(e.target.value)} /><input aria-label="Nouveau SKU" className="input" placeholder="SKU unique" value={newSku} onChange={e => setNewSku(e.target.value)} /></div><button type="button" disabled={busy || !newSize.trim() || !newColor.trim() || !newSku.trim()} onClick={addCombination} className="btn-primary mt-3">Ajouter à stock zéro</button></fieldset>
    </> : <>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"><strong>Configuration du stock par variantes requise</strong><p>Stock existant à répartir : Dépôt {total('DEPOT')} · Boutique {total('BOUTIQUE')}. Chaque total doit être conservé. Aucune quantité ne sera distribuée automatiquement.</p></div>
      <p className="text-sm text-ink-500">Les options enregistrées du produit préremplissent les tailles et couleurs. Vérifiez leur correspondance avant de générer la matrice. Les quantités restent à zéro jusqu’à votre saisie.</p>
      <div className="grid gap-3 sm:grid-cols-2">{[['Tailles depuis une option', setSizes], ['Couleurs depuis une option', setColors]].map(([label, setter]) => <label key={String(label)} className="text-sm font-bold">{String(label)}<select className="input mt-1" defaultValue="" onChange={e => { const o = config.options.find(o => o.label === e.target.value); if (o) (setter as (v: string) => void)(o.values.join(', ')); }}><option value="">Choisir une option enregistrée</option>{config.options.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}</select></label>)}</div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">Tailles (séparées par virgules)<input className="input mt-1" value={sizes} onChange={e => setSizes(e.target.value)} /></label><label className="text-sm font-bold">Couleurs<input className="input mt-1" value={colors} onChange={e => setColors(e.target.value)} /></label></div>
      <button type="button" className="btn-ghost" onClick={generate}>Générer la matrice</button>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Active', 'Variante', 'SKU', 'Dépôt', 'Boutique', 'Prix DT'].map(h => <th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={`${r.size}/${r.color}`} className="border-t"><td><input aria-label={`Activer ${r.size} ${r.color}`} type="checkbox" checked={r.active} onChange={e => setRows(rows.map((v, n) => n === i ? { ...v, active: e.target.checked } : v))} /></td><td className="whitespace-nowrap p-2">{r.size} / {r.color}</td>{(['sku', 'depot', 'boutique'] as const).map(key => <td key={key} className="p-1"><input aria-label={`${r.size} ${r.color} ${key}`} className={`input ${key === 'sku' ? 'min-w-36' : 'w-24'}`} type={key === 'sku' ? 'text' : 'number'} min={0} value={r[key]} onChange={e => setRows(rows.map((v, n) => n === i ? { ...v, [key]: key === 'sku' ? e.target.value : Number(e.target.value) } : v))} /></td>)}<td><input className="input w-24" aria-label={`Prix ${r.size} ${r.color}`} placeholder="Hérité" type="number" min={0} step="0.001" value={r.sellingPriceMinor == null ? '' : r.sellingPriceMinor / 1000} onChange={e => setRows(rows.map((v, n) => n === i ? { ...v, sellingPriceMinor: e.target.value === '' ? null : Math.round(Number(e.target.value) * 1000) } : v))} /></td></tr>)}</tbody></table></div>
      <p className="text-sm font-bold">Répartition : Dépôt {rows.reduce((s, r) => s + r.depot, 0)} / {total('DEPOT')} · Boutique {rows.reduce((s, r) => s + r.boutique, 0)} / {total('BOUTIQUE')}</p>
      <label className="block text-sm">Motif<input className="input mt-1" value={reason} onChange={e => setReason(e.target.value)} /></label>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || !rows.length} className="btn-ghost" onClick={() => save(true)}>Vérifier sans modifier</button><button type="button" disabled={busy || !rows.length} className="btn-primary" onClick={() => save(false)}>Valider et activer les variantes</button></div>
    </>}
  </section>;
}

function VariantEditor({ variant: v, onSaved, onMessage }: { variant: Config['variants'][number]; onSaved: () => Promise<void>; onMessage: (s: string) => void }) {
  const [sku, setSku] = useState(v.sku), [price, setPrice] = useState(v.sellingPriceMinor == null ? '' : String(v.sellingPriceMinor / 1000)), [threshold, setThreshold] = useState(v.lowStockThreshold == null ? '' : String(v.lowStockThreshold)), [active, setActive] = useState(v.active), [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try { const r = await fetch(`/api/admin/inventory/variants/${v.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku, active, sellingPriceMinor: price === '' ? null : Math.round(Number(price) * 1000), lowStockThreshold: threshold === '' ? null : Number(threshold) }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Modification refusée'); await onSaved(); onMessage('Variante enregistrée.'); } catch(e) { onMessage(String(e)); } finally { setBusy(false); }
  }
  return <tr className="border-t"><td className="whitespace-nowrap p-2">{v.attributes.size} / {v.attributes.color}</td><td className="p-1"><input aria-label={`SKU ${v.sku}`} className="input min-w-36" value={sku} onChange={e => setSku(e.target.value)} /></td><td className="p-2">{v.stock.find(s => s.locationId === 'DEPOT')?.onHand ?? 0}</td><td className="p-2">{v.stock.find(s => s.locationId === 'BOUTIQUE')?.onHand ?? 0}</td><td><input aria-label={`Prix ${v.sku}`} className="input w-24" type="number" min={0} step="0.001" placeholder="Hérité" value={price} onChange={e => setPrice(e.target.value)} /></td><td><input aria-label={`Seuil ${v.sku}`} className="input w-20" type="number" min={0} placeholder="Hérité" value={threshold} onChange={e => setThreshold(e.target.value)} /></td><td className="p-2"><input aria-label={`Activer ${v.sku}`} type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /></td><td><button type="button" disabled={busy || !sku.trim()} className="btn-ghost text-xs" onClick={save}>Enregistrer</button></td></tr>;
}
