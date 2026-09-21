'use client';
import SimpleStockModal from './SimpleStockModal';
import { useEffect, useRef, useState } from 'react';
import VariantMatrix from './VariantMatrix';

type Row = {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  size: string;
  color: string;
  available: number;
  reserved: number;
  onHand: number;
  threshold: number;
  migrationRequired: boolean;
  trackingMode?: 'SIMPLE' | 'VARIANT';
};
type Data = { items: Row[]; total: number; totalPages: number; products: { id: string; name: string }[]; sizes: string[]; colors: string[] };

function ModeBadge({ mode }: { mode?: 'SIMPLE' | 'VARIANT' }) {
  if (mode === 'VARIANT') {
    return <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-700">VARIANTES</span>;
  }
  return <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">GLOBAL</span>;
}

export default function VariantStockView({ locationId: initialLocation }: { locationId: 'DEPOT' | 'BOUTIQUE' }) {
  const [locationId, setLocationId] = useState(initialLocation);
  const [allRows, setAllRows] = useState<Row[]>([]);
  const [reportLoading, setReportLoading] = useState(true);
  const [reportError, setReportError] = useState('');
  const [configuring, setConfiguring] = useState<Row | null>(null);
  const [simpleAdjust, setSimpleAdjust] = useState<Row | null>(null);
  const [data, setData] = useState<Data>({ items: [], total: 0, totalPages: 0, products: [], sizes: [], colors: [] });
  const [filters, setFilters] = useState({ search: '', productId: '', size: '', color: '', status: '', sort: 'name' });
  const [page, setPage] = useState(1), [refresh, setRefresh] = useState(0), [error, setError] = useState(''), [loading, setLoading] = useState(true);

  useEffect(() => {
    const c = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const queryParams: Record<string, string> = { ...filters, locationId, page: String(page) };
        if (locationId === 'BOUTIQUE') {
          queryParams.groupBy = 'product';
        }
        const searchParams = new URLSearchParams();
        for (const [k, v] of Object.entries(queryParams)) {
          if (v) searchParams.set(k, v);
        }
        const r = await fetch(`/api/admin/variant-stock?${searchParams.toString()}`, { signal: c.signal, cache: 'no-store' });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setData(d);
        setError('');
      } catch (e) {
        if (!c.signal.aborted) setError(String(e));
      } finally {
        if (!c.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => { clearTimeout(t); c.abort(); };
  }, [filters, page, locationId, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    setReportLoading(true); setReportError(''); setAllRows([]);
    async function loadReport() {
      const read = async (page: number): Promise<Data> => {
        const response = await fetch(`/api/admin/variant-stock?${new URLSearchParams({ locationId, page: String(page) })}`, { signal: controller.signal, cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? 'Rapport indisponible');
        return result;
      };
      const first = await read(1);
      const rows = [...first.items];
      for (let page = 2; page <= first.totalPages; page++) rows.push(...(await read(page)).items);
      if (!controller.signal.aborted) setAllRows(rows);
    }
    void loadReport().catch(e => { if (!controller.signal.aborted) setReportError(e.message); }).finally(() => { if (!controller.signal.aborted) setReportLoading(false); });
    return () => controller.abort();
  }, [locationId, refresh]);

  const stats = allRows.reduce((sum, row) => ({ onHand: sum.onHand + row.onHand, available: sum.available + row.available, reserved: sum.reserved + row.reserved, out: sum.out + Number(row.available <= 0) }), { onHand: 0, available: 0, reserved: 0, out: 0 });

  function printStock() {
    const popup = window.open('', '_blank', 'width=1100,height=800');
    if (!popup) { setError('Autorisez les fenêtres contextuelles pour imprimer.'); return; }
    const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
    const title = locationId === 'DEPOT' ? 'Stock Dépôt' : 'Stock Boutique';
    popup.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title><style>
      @page{size:A4 landscape;margin:14mm}*{box-sizing:border-box;print-color-adjust:exact;-webkit-print-color-adjust:exact}body{font:12px Arial,sans-serif;color:#172554;margin:24px}h1{font-size:28px;color:#1d4ed8;margin-bottom:8px}.summary{display:flex;gap:20px;background:#eff6ff;padding:18px;margin:20px 0;border-radius:10px}.summary strong{display:block;font-size:22px;margin-top:6px}table{border-collapse:collapse;width:100%}th{background:#1e40af;color:white;text-align:left}td,th{padding:9px;border-bottom:1px solid #dbeafe}tr:nth-child(even){background:#f8fafc}tr{break-inside:avoid}thead{display:table-header-group}.out{color:#b91c1c;font-weight:bold}.note{color:#64748b;font-size:10px}.badge-global{background:#dbeafe;color:#1d4ed8;padding:1px 6px;border-radius:999px;font-size:10px;font-weight:bold}.badge-variant{background:#ede9fe;color:#7c3aed;padding:1px 6px;border-radius:999px;font-size:10px;font-weight:bold}
      </style></head><body><h1>Mzali Boutique · ${title}</h1><p>État détaillé · ${escape(new Date().toLocaleString('fr-TN'))} · Tous les produits, tailles et couleurs</p><div class="summary"><div>Stock physique<strong>${stats.onHand}</strong></div><div>Disponible<strong>${stats.available}</strong></div><div>${locationId === 'DEPOT' ? 'Combinaisons épuisées' : 'Produits épuisés'}<strong>${stats.out}</strong></div></div><table><thead><tr>${['Produit', 'Mode', 'Taille', 'Couleur', 'SKU', 'Physique', 'Disponible'].map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${allRows.map(row => `<tr><td>${escape(row.productName)}${row.migrationRequired ? '<br><span class="note">À répartir par taille et couleur</span>' : ''}</td><td>${row.trackingMode === 'VARIANT' ? '<span class="badge-variant">VARIANTES</span>' : '<span class="badge-global">GLOBAL</span>'}</td><td>${escape(row.size || '—')}</td><td>${escape(row.color || '—')}</td><td>${escape(row.sku)}</td><td>${row.onHand}</td><td class="${row.available <= 0 ? 'out' : ''}">${row.available}${row.available <= 0 ? ' · Épuisé' : ''}</td></tr>`).join('')}</tbody></table><p class="note">${allRows.length} lignes · Rapport complet de cet emplacement, indépendamment des filtres affichés.</p></body></html>`);
    popup.document.close(); popup.focus(); popup.print();
  }

  function filter(key: keyof typeof filters, value: string) { setFilters(f => ({ ...f, [key]: value })); setPage(1); }

  function openAdjust(r: Row) {
    if (locationId === 'DEPOT') {
      setSimpleAdjust(r);
    } else {
      const mode = r.trackingMode ?? 'SIMPLE';
      if (mode === 'SIMPLE') {
        setSimpleAdjust(r);
      } else {
        setConfiguring(r);
      }
    }
  }

  const tableHeaders = locationId === 'DEPOT'
    ? ['Produit', 'Taille', 'Couleur', 'SKU', 'Disponible', 'Stock', 'Actions']
    : ['Produit', 'Mode', 'Disponible', 'Stock', 'Actions'];

  return (
    <div className="p-4 sm:p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Stock</h1>
          <p className="mt-1 text-sm text-ink-500">
            {locationId === 'DEPOT' ? 'Disponibilité des commandes en ligne par variante (taille / couleur).' : 'Stock pour la caisse POS.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" disabled={reportLoading || !!reportError} onClick={printStock}>Imprimer le stock détaillé</button>
          <button className="btn-ghost" onClick={() => setRefresh(v => v + 1)}>Actualiser</button>
        </div>
      </header>

      {reportError && <p role="alert" className="mb-4 text-red-700">{reportError}</p>}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[['Stock physique', stats.onHand], ['Disponible', stats.available], [locationId === 'DEPOT' ? 'Combinaisons épuisées' : 'Produits épuisés', stats.out]].map(([label, value]) => (
          <div className="rounded-2xl border bg-white p-4" key={label}>
            <p className="text-sm text-ink-500">{label}</p>
            <p className="mt-2 text-2xl font-black text-blue-700">{reportLoading ? '…' : reportError ? '—' : value}</p>
          </div>
        ))}
      </div>

      <label className="mb-4 flex flex-wrap items-center gap-3 text-sm font-bold">
        Emplacement
        <select className="input w-auto" value={locationId} onChange={e => {
          setLocationId(e.target.value as 'DEPOT' | 'BOUTIQUE');
          setPage(1); setConfiguring(null); setSimpleAdjust(null); setLoading(true); setReportLoading(true); setAllRows([]);
          setData({ items: [], total: 0, totalPages: 0, products: [], sizes: [], colors: [] });
        }}>
          <option value="DEPOT">Dépôt</option>
          <option value="BOUTIQUE">Boutique</option>
        </select>
      </label>

      <p className="mb-4 text-xs text-ink-500">Totaux et impression : tout le stock de cet emplacement. Les filtres ci-dessous concernent uniquement le tableau.</p>

      <div className="mb-5 flex flex-wrap gap-3 rounded-2xl border bg-white p-4">
        <input aria-label="Rechercher" placeholder="Rechercher un produit, SKU…" className="input w-56" value={filters.search} onChange={e => filter('search', e.target.value)} />
        <select aria-label="productId" className="input w-auto" value={filters.productId} onChange={e => filter('productId', e.target.value)}>
          <option value="">Tous les produits</option>
          {data.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {locationId === 'DEPOT' && data.sizes.length > 0 && (
          <select aria-label="size" className="input w-auto" value={filters.size} onChange={e => filter('size', e.target.value)}>
            <option value="">Toutes les tailles</option>
            {data.sizes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {locationId === 'DEPOT' && data.colors.length > 0 && (
          <select aria-label="color" className="input w-auto" value={filters.color} onChange={e => filter('color', e.target.value)}>
            <option value="">Toutes les couleurs</option>
            {data.colors.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <select aria-label="status" className="input w-auto" value={filters.status} onChange={e => filter('status', e.target.value)}>
          <option value="">Tous les stocks</option>
          <option value="in">En stock</option>
          <option value="low">Stock faible</option>
          <option value="out">Épuisé</option>
        </select>
        <select aria-label="sort" className="input w-auto" value={filters.sort} onChange={e => filter('sort', e.target.value)}>
          <option value="name">Produit A-Z</option>
          <option value="available">Disponible croissant</option>
        </select>
      </div>

      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full whitespace-nowrap text-left text-sm">
          <thead className="bg-ink-100">
            <tr>
              {tableHeaders.map(h => (
                <th className="p-3" key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map((r, idx) => (
              <tr className="border-t hover:bg-slate-50/50" key={r.variantId ? `${r.productId}-${r.variantId}` : `${r.productId}-${idx}`}>
                <td className="p-3 font-bold">
                  <button className="text-left hover:text-blue-700 hover:underline" onClick={() => setConfiguring(r)}>
                    {r.productName}
                  </button>
                  {r.migrationRequired && (
                    <small className="block font-normal text-amber-700">Stock à répartir par taille et couleur</small>
                  )}
                </td>
                {locationId === 'DEPOT' ? (
                  <>
                    <td className="p-3">
                      {r.size ? (
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">
                          {r.size}
                        </span>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      {r.color ? (
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">
                          {r.color}
                        </span>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      {r.sku ? (
                        <code className="rounded bg-slate-50 px-1 py-0.5 font-mono text-xs text-ink-600">{r.sku}</code>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                  </>
                ) : (
                  <td className="p-3">
                    <ModeBadge mode={r.trackingMode} />
                  </td>
                )}
                <td className={`p-3 font-bold ${r.available <= 0 ? 'text-red-700' : r.available <= r.threshold ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {r.available} {r.available <= 0 ? '· Épuisé' : r.available <= r.threshold ? '· Faible' : ''}
                </td>
                <td className="p-3">{r.onHand}</td>
                <td className="p-3">
                  <div className="flex gap-1">
                    <button
                      id={`adjust-${r.variantId || r.productId}`}
                      className="btn-ghost text-xs"
                      onClick={() => openAdjust(r)}
                    >
                      Ajuster
                    </button>
                    {(r.trackingMode === 'VARIANT' || r.migrationRequired || locationId === 'DEPOT') && (
                      <button className="btn-ghost text-xs" onClick={() => setConfiguring(r)}>Matrice</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!data.items.length && (
              <tr><td colSpan={locationId === 'DEPOT' ? 7 : 5} className="p-8 text-center">{loading ? 'Chargement…' : 'Aucun produit.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <span>{data.total} {locationId === 'DEPOT' ? 'variantes' : 'produits'} · Page {page} / {Math.max(1, data.totalPages)}</span>
        <div className="flex gap-2">
          <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Précédent</button>
          <button className="btn-ghost" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>Suivant</button>
        </div>
      </div>

      {/* Compact simple-mode adjustment modal */}
      {simpleAdjust && (
        <SimpleStockModal
          productId={simpleAdjust.productId}
          productName={
            locationId === 'DEPOT' && (simpleAdjust.size || simpleAdjust.color)
              ? `${simpleAdjust.productName} · ${[simpleAdjust.size, simpleAdjust.color].filter(Boolean).join(' / ')}`
              : simpleAdjust.productName
          }
          locationId={locationId}
          currentOnHand={simpleAdjust.onHand}
          currentReserved={simpleAdjust.reserved}
          depotVariantId={locationId === 'DEPOT' ? simpleAdjust.variantId : undefined}
          onClose={(saved) => {
            setSimpleAdjust(null);
            if (saved) setRefresh(v => v + 1);
          }}
        />
      )}

      {/* Full matrix configuration modal */}
      {configuring && (
        <StockConfiguration
          locationId={locationId}
          product={configuring}
          onClose={() => { setConfiguring(null); setRefresh(v => v + 1); }}
        />
      )}
    </div>
  );
}

function StockConfiguration({ product, locationId, onClose }: { product: Row; locationId: 'DEPOT' | 'BOUTIQUE'; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return (
    <dialog ref={dialog} onCancel={e => { if (saving) e.preventDefault(); else onClose(); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-5xl overflow-y-auto rounded-2xl border p-0 shadow-xl backdrop:bg-slate-900/40">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-white p-4">
        <h2 className="text-xl font-black">{product.productName}</h2>
        <button type="button" className="btn-ghost" disabled={saving} onClick={onClose}>Fermer</button>
      </header>
      <div className="p-4 sm:p-6">
        <VariantMatrix key={product.productId} productId={product.productId} onBusyChange={setSaving} initialLocation={locationId} />
      </div>
    </dialog>
  );
}
