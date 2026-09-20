'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Package, Search, X } from 'lucide-react';
import { useAdminHref } from '@/lib/admin-nav-context';
import type { Transfer } from './TransfersView';

type Product = { id: string; name: string };
type StockVariant = { variantId: string; productId: string; productName: string; size: string; color: string; available: number; active: boolean; migrationRequired: boolean };
type Line = StockVariant & { requestedQuantity: number };

export default function CreateTransferDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: (transfer: Transfer) => void }) {
  const href = useAdminHref();
  const dialog = useRef<HTMLDialogElement>(null);
  const [source, setSource] = useState('DEPOT');
  const destination = source === 'DEPOT' ? 'BOUTIQUE' : 'DEPOT';
  const [products, setProducts] = useState<Product[]>([]);
  const [product, setProduct] = useState<Product | null>(null);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [variants, setVariants] = useState<StockVariant[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => { dialog.current?.showModal(); }, []);

  useEffect(() => {
    const controller = new AbortController();
    setCatalogLoading(true);
    fetch(`/api/admin/variant-stock?locationId=${source}`, { signal: controller.signal, cache: 'no-store' })
      .then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error ?? 'Chargement impossible'); setProducts(data.products ?? []); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setCatalogLoading(false); });
    return () => controller.abort();
  }, [source, retry]);

  useEffect(() => {
    const controller = new AbortController();
    setVariants([]);
    if (!product) { setLoading(false); return () => controller.abort(); }
    setLoading(true); setError('');
    async function load() {
      const read = async (page: number) => {
        const res = await fetch(`/api/admin/variant-stock?${new URLSearchParams({ locationId: source, productId: product!.id, page: String(page) })}`, { signal: controller.signal, cache: 'no-store' });
        const data = await res.json(); if (!res.ok) throw new Error(data.error ?? 'Chargement impossible');
        return data as { items: StockVariant[]; totalPages: number };
      };
      const first = await read(1);
      const rest = await Promise.all(Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, i) => read(i + 2)));
      if (!controller.signal.aborted) {
        const rows = [first, ...rest].flatMap(p => p.items);
        setVariants(rows);
        setLines(previous => previous.map(line => { const fresh = rows.find(v => v.variantId === line.variantId); return fresh ? { ...line, ...fresh } : line; }));
      }
    }
    void load().catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [product, source, retry]);

  const filtered = products.filter(p => p.name.toLocaleLowerCase('fr').includes(search.trim().toLocaleLowerCase('fr')));
  const total = lines.reduce((sum, line) => sum + line.requestedQuantity, 0);
  const invalid = lines.some(l => !Number.isSafeInteger(l.requestedQuantity) || l.requestedQuantity <= 0 || l.requestedQuantity > l.available || !l.active || l.migrationRequired);
  function select(p: Product) { setProduct(p); setSearch(''); setOpen(false); }
  function quantity(v: StockVariant, value: number) {
    setLines(previous => value === 0 ? previous.filter(l => l.variantId !== v.variantId) : previous.some(l => l.variantId === v.variantId)
      ? previous.map(l => l.variantId === v.variantId ? { ...v, requestedQuantity: value } : l)
      : [...previous, { ...v, requestedQuantity: value }]);
  }
  async function submit() {
    if (!lines.length || invalid || loading || busy) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/admin/inventory/transfers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceLocationId: source, destinationLocationId: destination, lines: lines.map(l => ({ productId: l.productId, variantId: l.variantId, requestedQuantity: l.requestedQuantity })) }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error ?? 'Création impossible');
      onCreated(data);
    } catch(e) { setError(e instanceof Error ? e.message : 'Création impossible'); } finally { setBusy(false); }
  }

  return <dialog ref={dialog} onCancel={e => { if (busy) e.preventDefault(); else onClose(); }} aria-labelledby="transfer-title" className="fixed inset-0 m-auto max-h-[94dvh] w-[calc(100%_-_2rem)] max-w-5xl overflow-y-auto rounded-2xl bg-slate-50 p-0 shadow-2xl backdrop:bg-slate-900/40">
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b bg-white px-5 py-4"><div><h2 id="transfer-title" className="text-xl font-black">Préparer un transfert</h2><p className="mt-1 text-sm text-ink-500">Choisissez un produit, puis les quantités par taille et couleur.</p></div><button aria-label="Fermer" className="btn-ghost" disabled={busy} onClick={onClose}><X size={20} /></button></header>
    <div className="space-y-5 p-4 sm:p-6">
      <label className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4"><span className="text-sm font-bold">Trajet</span><select className="input w-auto" disabled={busy} value={source} onChange={e => { setSource(e.target.value); setLines([]); setProduct(null); setSearch(''); setError(''); }}><option value="DEPOT">Dépôt → Boutique</option><option value="BOUTIQUE">Boutique → Dépôt</option></select><ArrowRight size={18} className="text-blue-600" /><span className="text-sm text-ink-500">Stock disponible à la source uniquement</span></label>
      {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}<button className="ml-3 underline" disabled={busy} onClick={() => { setError(''); setRetry(v => v + 1); }}>Actualiser les disponibilités</button></div>}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0 space-y-4 rounded-2xl border bg-white p-4 sm:p-5">
          <h3 className="font-bold">1. Choisir un produit</h3>
          <div className="relative" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
            <label className="sr-only" htmlFor="transfer-product">Produit</label><Search size={18} className="pointer-events-none absolute left-3 top-3.5 text-ink-400" />
            <input id="transfer-product" role="combobox" aria-expanded={open} aria-controls="transfer-products" aria-autocomplete="list" disabled={busy} autoComplete="off" className="input pl-10" placeholder="Choisir un produit…" value={search} onFocus={() => setOpen(true)} onChange={e => { setSearch(e.target.value); setOpen(true); }} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); document.querySelector<HTMLButtonElement>('#transfer-products button')?.focus(); } if (e.key === 'Enter' && open && filtered[0]) { e.preventDefault(); select(filtered[0]); } }} />
            {open && <div id="transfer-products" role="listbox" aria-label="Produits disponibles" className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border bg-white p-1 shadow-xl" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); document.getElementById('transfer-product')?.focus(); setOpen(false); } if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const buttons = Array.from(e.currentTarget.querySelectorAll('button')); const index = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[(index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus(); } }}>{catalogLoading ? <p className="p-3 text-sm">Chargement des produits…</p> : filtered.map(p => <button role="option" aria-selected={product?.id === p.id} key={p.id} onClick={() => select(p)} className="flex w-full items-center gap-3 rounded-lg p-3 text-left text-sm hover:bg-blue-50 focus:bg-blue-50"><Package size={16} className="shrink-0 text-blue-600" /><span>{p.name}</span></button>)}{!catalogLoading && !filtered.length && <p className="p-3 text-sm text-ink-500">Aucun produit trouvé.</p>}</div>}
          </div>
          {!product ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-ink-500"><Package className="mx-auto mb-3 text-blue-500" size={28} />Cliquez dans le champ pour voir les produits. La recherche est facultative.</div> : <>
            <div className="border-t pt-4"><h3 className="font-bold">2. {product.name}</h3><p className="mt-1 text-sm text-ink-500">Renseignez seulement les combinaisons à envoyer. Laissez les autres à 0.</p></div>
            {loading ? <p className="p-4 text-sm">Chargement des tailles et couleurs…</p> : variants.some(v => v.migrationRequired) ? <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Répartissez d’abord le stock de ce produit par taille et couleur dans <Link className="font-bold underline" href={href('/stock-depot')}>Stock Dépôt</Link>.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr>{['Taille', 'Couleur', 'Disponible', 'À envoyer'].map(h => <th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{variants.map(v => { const qty = lines.find(l => l.variantId === v.variantId)?.requestedQuantity ?? 0; const unavailable = !v.active || v.available <= 0; return <tr key={v.variantId} className={`border-t ${qty > 0 ? 'bg-blue-50/60' : ''}`}><td className="p-2 font-bold">{v.size}</td><td className="p-2">{v.color}</td><td className={`p-2 font-bold ${unavailable ? 'text-ink-400' : 'text-emerald-700'}`}>{!v.active ? 'Inactive' : v.available <= 0 ? 'Épuisé' : v.available}</td><td className="p-2"><input aria-label={`Quantité ${product.name} ${v.size} ${v.color}`} aria-invalid={qty > v.available || qty < 0 || !Number.isSafeInteger(qty)} className="input w-24" type="number" min={0} max={Math.max(0, v.available)} step={1} disabled={busy || unavailable} value={qty} onFocus={e => e.target.select()} onChange={e => quantity(v, Number(e.target.value))} /></td></tr>; })}{!variants.length && <tr><td colSpan={4} className="p-4 text-ink-500">Aucune combinaison configurée pour ce produit.</td></tr>}</tbody></table></div>}
          </>}
        </section>
        <aside className="rounded-2xl border bg-white p-4 lg:sticky lg:top-24"><h3 className="font-bold">Votre sélection</h3><p className="mt-1 text-sm text-ink-500">{lines.length} combinaisons · {total} pièces</p><div className="mt-4 max-h-96 space-y-3 overflow-y-auto">{lines.map(l => <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3" key={l.variantId}><div className="min-w-0 flex-1"><p className="text-sm font-bold">{l.productName}</p><p className="text-xs text-ink-500">{l.size} / {l.color}</p><p className="mt-1 text-sm font-black text-blue-700">{l.requestedQuantity} pièces</p></div><button disabled={busy} aria-label={`Retirer ${l.productName} ${l.size} ${l.color}`} onClick={() => quantity(l, 0)} className="rounded-lg p-1 hover:bg-red-50"><X size={16} /></button></div>)}{!lines.length && <p className="py-4 text-sm text-ink-400">Les quantités choisies apparaîtront ici.</p>}</div></aside>
      </div>
    </div>
    <footer className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t bg-white px-5 py-4"><div><p className="font-black">{total} pièces à transférer</p><p className="text-xs text-ink-500">Vous pourrez ensuite approuver, expédier et réceptionner.</p>{invalid && <p role="alert" className="mt-1 text-sm text-red-700">Saisissez des quantités entières, sans dépasser le stock disponible.</p>}</div><button disabled={busy || loading || !lines.length || invalid} onClick={() => void submit()} className="btn-primary">{busy ? 'Création…' : 'Créer le transfert'}</button></footer>
  </dialog>;
}
