'use client';
import { useEffect, useState } from 'react';
import AdjustStockModal from './AdjustStockModal';
import { useAdminHref } from '@/lib/admin-nav-context';

type Item = {
  productId: string;
  productName: string;
  imageUrl: string | null;
  hasVariants: boolean;
  variantCount: number;
  onHand: number;
  available: number;
  disabledStock: number;
  soldOutVariants: number;
  state: 'in' | 'low' | 'out';
};
type Data = { items: Item[]; total: number; totalPages: number; page: number; summary: { stockTotal: number; available: number; soldOutCombinations: number; lowStockProducts: number } };
const EMPTY: Data = { items: [], total: 0, totalPages: 0, page: 1, summary: { stockTotal: 0, available: 0, soldOutCombinations: 0, lowStockProducts: 0 } };
type DetailRow = { productName: string; size: string; color: string; sku: string; active: boolean; onHand: number; reserved: number; available: number };

const fmt = (n: number) => n.toLocaleString('fr-FR');
const STATE_LABEL = { in: 'En stock', low: 'Stock faible', out: 'Épuisé' } as const;
const STATE_TONE = {
  in: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  low: 'bg-amber-50 text-amber-800 ring-amber-200',
  out: 'bg-red-50 text-red-700 ring-red-200',
} as const;

/** Admin -> Stock: ONE inventory (DEPOT), shared by the website, admin orders and the POS till. */
export default function StockOverview({ initialProductId = '' }: { initialProductId?: string }) {
  const adminHref = useAdminHref();
  const [data, setData] = useState<Data>(EMPTY);
  const [filters, setFilters] = useState({ search: '', status: '', sort: 'name', productId: initialProductId });
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [configuring, setConfiguring] = useState<{ productId: string; productName: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page) });
        for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
        const res = await fetch(`/api/admin/variant-stock?${params}`, { signal: controller.signal, cache: 'no-store' });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Stock indisponible');
        setData(body as Data);
        setError('');
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Stock indisponible');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [filters, page, refresh]);

  // Deep link from the product editor: open that product's adjustment straight away.
  useEffect(() => {
    if (!initialProductId || configuring || !data.items.length) return;
    const hit = data.items.find((i) => i.productId === initialProductId);
    if (hit) setConfiguring({ productId: hit.productId, productName: hit.productName });
    // only on the first load for that product
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.items, initialProductId]);

  function filter(key: 'search' | 'status' | 'sort', value: string) {
    setFilters((f) => ({ ...f, [key]: value, productId: '' }));
    setPage(1);
  }

  async function printDetailed() {
    const popup = window.open('', '_blank', 'width=1100,height=800');
    if (!popup) { setError('Autorisez les fenêtres contextuelles pour imprimer.'); return; }
    try {
      const res = await fetch('/api/admin/variant-stock/details', { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Rapport indisponible');
      const rows = body.rows as DetailRow[];
      const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
      const total = rows.filter((r) => r.active).reduce((s, r) => s + r.onHand, 0);
      popup.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Stock</title><style>
        @page{size:A4 landscape;margin:14mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#172554;margin:24px}h1{font-size:26px;color:#1d4ed8;margin:0 0 6px}
        table{width:100%;border-collapse:collapse;margin-top:14px}th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}th{background:#eff6ff}td.n{text-align:right;font-variant-numeric:tabular-nums}.off{color:#94a3b8}
        </style></head><body><h1>Stock</h1><p>${esc(new Date().toLocaleString('fr-TN'))} · stock vendable : ${esc(total.toLocaleString('fr-FR'))} pièces</p>
        <table><thead><tr><th>Produit</th><th>Couleur</th><th>Taille</th><th>SKU</th><th>Stock</th><th>Réservé</th><th>Disponible</th><th>Vente</th></tr></thead><tbody>
        ${rows.map((r) => `<tr class="${r.active ? '' : 'off'}"><td>${esc(r.productName)}</td><td>${esc(r.color)}</td><td>${esc(r.size)}</td><td>${esc(r.sku)}</td><td class="n">${r.onHand}</td><td class="n">${r.reserved}</td><td class="n">${r.available}</td><td>${r.active ? 'Oui' : 'Désactivée'}</td></tr>`).join('')}
        </tbody></table></body></html>`);
      popup.document.close();
      popup.focus();
      popup.print();
    } catch (e) {
      popup.close();
      setError(e instanceof Error ? e.message : 'Rapport indisponible');
    }
  }

  const cards: [string, number, string][] = [
    ['Stock total', data.summary.stockTotal, 'text-blue-700'],
    ['Disponible', data.summary.available, 'text-emerald-700'],
    ['Combinaisons épuisées', data.summary.soldOutCombinations, data.summary.soldOutCombinations ? 'text-red-700' : 'text-ink-900'],
    ['Stock faible', data.summary.lowStockProducts, data.summary.lowStockProducts ? 'text-amber-700' : 'text-ink-900'],
  ];

  return (
    <div className="p-4 sm:p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Stock</h1>
          <p className="mt-1 text-sm text-ink-500">Stock disponible pour les ventes en ligne, les commandes Admin et la caisse POS.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={printDetailed}>Imprimer le stock détaillé</button>
          <a className="btn-ghost" href={adminHref('/stock-movements')}>Historique</a>
          <button type="button" className="btn-ghost" onClick={() => setRefresh((v) => v + 1)}>Actualiser</button>
        </div>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(([label, value, tone]) => (
          <div key={label} className="rounded-2xl border bg-white p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-500">{label}</p>
            <p className={`mt-2 text-2xl font-black tabular-nums ${tone}`}>{loading && !data.items.length ? '…' : fmt(value)}</p>
          </div>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap gap-3 rounded-2xl border bg-white p-4">
        <input aria-label="Rechercher" placeholder="Rechercher un produit…" className="input w-64" value={filters.search} onChange={(e) => filter('search', e.target.value)} />
        <select aria-label="État" className="input w-auto" value={filters.status} onChange={(e) => filter('status', e.target.value)}>
          <option value="">Tous les états</option>
          <option value="in">En stock</option>
          <option value="low">Stock faible</option>
          <option value="out">Épuisé</option>
        </select>
        <select aria-label="Tri" className="input w-auto" value={filters.sort} onChange={(e) => filter('sort', e.target.value)}>
          <option value="name">Produit A-Z</option>
          <option value="available">Disponible croissant</option>
        </select>
      </div>

      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full whitespace-nowrap text-left text-sm">
          <thead className="bg-ink-100">
            <tr>{['Produit', 'Disponible', 'Stock', 'État', 'Actions'].map((h) => <th key={h} className="p-3 text-xs font-bold uppercase text-ink-700">{h}</th>)}</tr>
          </thead>
          <tbody>
            {data.items.map((r) => (
              <tr key={r.productId} className="border-t hover:bg-slate-50/60">
                <td className="p-3">
                  <button type="button" className="flex items-center gap-3 text-left" onClick={() => setConfiguring({ productId: r.productId, productName: r.productName })}>
                    {r.imageUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={r.imageUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
                      : <span className="h-10 w-10 rounded-lg bg-ink-100" />}
                    <span>
                      <span className="block font-bold text-ink-900 hover:text-blue-700 hover:underline">{r.productName}</span>
                      {r.hasVariants && <span className="block text-xs font-normal text-ink-500">{r.variantCount} variantes{r.soldOutVariants ? ` · ${r.soldOutVariants} épuisée${r.soldOutVariants > 1 ? 's' : ''}` : ''}</span>}
                      {r.disabledStock > 0 && <span className="block text-xs font-normal text-amber-700">{fmt(r.disabledStock)} en stock sur des variantes désactivées</span>}
                    </span>
                  </button>
                </td>
                <td className={`p-3 font-black tabular-nums ${r.state === 'out' ? 'text-red-700' : r.state === 'low' ? 'text-amber-700' : 'text-emerald-700'}`}>{fmt(r.available)}</td>
                <td className="p-3 tabular-nums">{fmt(r.onHand)}</td>
                <td className="p-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${STATE_TONE[r.state]}`}>{STATE_LABEL[r.state]}</span></td>
                <td className="p-3">
                  <button type="button" id={`adjust-${r.productId}`} className="text-xs font-bold text-blue-700 hover:underline" onClick={() => setConfiguring({ productId: r.productId, productName: r.productName })}>Ajuster</button>
                </td>
              </tr>
            ))}
            {!data.items.length && <tr><td colSpan={5} className="p-8 text-center text-ink-500">{loading ? 'Chargement…' : 'Aucun produit.'}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <span>{data.total} produit{data.total > 1 ? 's' : ''} · Page {page} / {Math.max(1, data.totalPages)}</span>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Précédent</button>
          <button type="button" className="btn-ghost" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Suivant</button>
        </div>
      </div>

      {configuring && (
        <AdjustStockModal
          key={configuring.productId}
          productId={configuring.productId}
          productName={configuring.productName}
          onClose={(changed) => { setConfiguring(null); if (changed) setRefresh((v) => v + 1); }}
        />
      )}
    </div>
  );
}
