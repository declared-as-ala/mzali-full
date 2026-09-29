'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, X, AlertTriangle } from 'lucide-react';
import { productStockRows, type StockRow } from '@/lib/product-stock-options';
import {
  analyze, buildGrid, currentTotal, formatPieces, initialDraft, parseQty, totals,
  type Draft, type StockConfig, type StockVariantRow,
} from '@/lib/stock-editor';
import { useToast } from './Toast';

/**
 * Stock adjustment for ONE product, on the single DEPOT inventory.
 *  - product with variants  -> quantity grid (colors x sizes) + availability grid;
 *  - product without variants -> one quantity + one availability switch.
 * Nothing is saved while typing: one "Enregistrer les modifications" sends only what changed,
 * in one atomic request (quantities go through the stock ledger as manual adjustments).
 */
export default function AdjustStockModal({ productId, productName, onClose }: { productId: string; productName: string; onClose: (changed: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const toast = useToast();
  const [config, setConfig] = useState<StockConfig | null>(null);
  const [draft, setDraft] = useState<Draft>({ qty: {}, active: {} });
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [splitMode, setSplitMode] = useState(false);
  const [alloc, setAlloc] = useState<Record<string, string>>({});

  useEffect(() => { dialog.current?.showModal(); }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoadError('');
    try {
      const res = await fetch(`/api/admin/variant-stock/products/${productId}`, { cache: 'no-store', signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Chargement impossible');
      const next = data as StockConfig;
      setConfig(next);
      setDraft(initialDraft(next));
    } catch (e) {
      if (!signal?.aborted) setLoadError(e instanceof Error ? e.message : 'Chargement impossible');
    }
  }, [productId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const grid = useMemo(() => (config ? buildGrid(config) : null), [config]);
  const analysis = useMemo(() => (config ? analyze(config, draft) : null), [config, draft]);
  const live = useMemo(() => (config && grid ? totals(config, grid, draft) : null), [config, grid, draft]);
  const saved = config ? currentTotal(config) : 0;

  // Products with two option axes but no variants yet can be split by size/color once.
  const splitRows: StockRow[] = useMemo(() => (config && !config.hasVariants ? productStockRows(productId, config.options) : []), [config, productId]);
  const canSplit = Boolean(config && !config.hasVariants && splitRows.length > 0);
  const allocTotal = splitRows.reduce((sum, r) => sum + (parseQty(alloc[`${r.size}\u0000${r.color}`] ?? '0') ?? 0), 0);

  const dirty = splitMode ? Object.values(alloc).some((v) => v.trim() !== '' && v !== '0') : Boolean(analysis?.dirty);
  const canSave = splitMode ? splitRows.length > 0 && splitRows.every((r) => parseQty(alloc[`${r.size}\u0000${r.color}`] ?? '0') !== null) : Boolean(analysis?.canSave);

  function requestClose() {
    if (saving) return;
    if (dirty) { setConfirmDiscard(true); return; }
    onClose(false);
  }

  async function save() {
    if (!config || !canSave || saving) return;
    setSaving(true);
    setError('');
    try {
      if (splitMode) {
        const body = {
          reason: 'Répartition par taille et couleur',
          replaceDepotStock: true,
          initialStock: saved === 0,
          rows: splitRows.map((r, i) => ({
            size: r.size, color: r.color, sku: r.sku || `${productId}-${i}`, active: true,
            depot: parseQty(alloc[`${r.size}\u0000${r.color}`] ?? '0') ?? 0,
          })),
        };
        for (const dryRun of [true, false]) {
          const res = await fetch(`/api/admin/variant-stock/products/${productId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, dryRun }) });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? 'Enregistrement impossible');
        }
      } else {
        const res = await fetch(`/api/admin/variant-stock/products/${productId}/stock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: analysis!.rows, reason: 'Ajustement depuis la page Stock' }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Enregistrement impossible');
      }
      toast.success('Stock enregistré');
      onClose(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  }

  const setQty = (id: string, raw: string) => { if (/^\d{0,9}$/.test(raw)) setDraft((d) => ({ ...d, qty: { ...d.qty, [id]: raw } })); };
  const toggle = (id: string) => setDraft((d) => ({ ...d, active: { ...d.active, [id]: !d.active[id] } }));

  return (
    <dialog
      ref={dialog}
      onCancel={(e) => { e.preventDefault(); requestClose(); }}
      className="fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%_-_1.5rem)] max-w-4xl overflow-hidden rounded-2xl border border-ink-200 p-0 shadow-2xl backdrop:bg-slate-900/50"
    >
      <div className="flex max-h-[92dvh] flex-col bg-white">
        <header className="flex items-start justify-between gap-4 border-b border-ink-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-black text-ink-900">{productName}</h2>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Gestion du stock · Dépôt</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Stock total</p>
            <p className="text-2xl font-black text-blue-700">{config ? formatPieces(saved) : '…'}</p>
            {config && live && !splitMode && live.grand !== saved && (
              <p className="text-xs font-bold text-amber-700">→ {formatPieces(live.grand)} après enregistrement</p>
            )}
            {splitMode && <p className="text-xs font-bold text-amber-700">→ {formatPieces(allocTotal)} après répartition</p>}
          </div>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {loadError && (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <span>{loadError}</span>
              <button type="button" className="btn-ghost" onClick={() => void load()}>Réessayer</button>
            </div>
          )}
          {!config && !loadError && <div className="animate-pulse space-y-3"><div className="h-6 w-48 rounded bg-ink-100" /><div className="h-40 rounded-xl bg-ink-100" /></div>}

          {error && (
            <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <span className="flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}</span>
              <button type="button" className="shrink-0 rounded-lg bg-amber-600 px-3 py-1 text-xs font-bold text-white" onClick={() => { setError(''); void load(); }}>Actualiser</button>
            </div>
          )}

          {config && grid && splitMode && (
            <section aria-labelledby="split-title">
              <h3 id="split-title" className="mb-1 text-xs font-black uppercase tracking-wide text-ink-700">Répartir le stock par taille et couleur</h3>
              <p className="mb-3 text-xs text-ink-500">Le stock actuel ({formatPieces(saved)}) sera remplacé par cette répartition. L’ancien mouvement est conservé dans l’historique.</p>
              <SplitGrid rows={splitRows} alloc={alloc} setAlloc={setAlloc} />
            </section>
          )}

          {config && grid && !splitMode && config.hasVariants && live && (
            <>
              <section aria-labelledby="stock-title">
                <h3 id="stock-title" className="mb-2 text-xs font-black uppercase tracking-wide text-ink-700">Stock par variante</h3>
                <Matrix
                  grid={grid}
                  renderCell={(v, ctx) => (
                    <QtyInput
                      id={v.id}
                      label={`${v.attributes.color} ${v.attributes.size}`}
                      raw={draft.qty[v.id] ?? String(v.onHand)}
                      original={v.onHand}
                      changed={analysis!.changedQty.has(v.id)}
                      invalid={analysis!.invalid.has(v.id)}
                      disabled={saving}
                      onChange={(raw) => setQty(v.id, raw)}
                      col={ctx.col}
                      row={ctx.row}
                    />
                  )}
                  rowTotal={(color) => live.byColor[color] ?? 0}
                  colTotal={(size) => live.bySize[size] ?? 0}
                  grand={live.grand}
                />
              </section>

              <section aria-labelledby="avail-title">
                <h3 id="avail-title" className="mb-1 text-xs font-black uppercase tracking-wide text-ink-700">Disponibilité à la vente</h3>
                <p className="mb-2 text-xs text-ink-500">Choisissez les combinaisons qui peuvent être vendues (site, commandes Admin, caisse). Désactiver une variante conserve son stock.</p>
                <Matrix
                  grid={grid}
                  renderCell={(v) => (
                    <AvailabilitySwitch
                      label={`${v.attributes.color} ${v.attributes.size}`}
                      on={draft.active[v.id] ?? v.active}
                      changed={analysis!.changedActive.has(v.id)}
                      soldOut={(parseQty(draft.qty[v.id] ?? '') ?? v.onHand) === 0}
                      disabled={saving}
                      onToggle={() => toggle(v.id)}
                    />
                  )}
                />
                <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-700">
                  <li className="flex items-center gap-1.5"><span className="grid h-4 w-4 place-items-center rounded bg-emerald-500 text-white"><Check size={11} /></span> Disponible à la vente</li>
                  <li className="flex items-center gap-1.5"><span className="grid h-4 w-4 place-items-center rounded bg-red-100 text-red-600"><X size={11} /></span> Désactivée</li>
                  <li className="flex items-center gap-1.5"><span className="text-slate-300">—</span> Combinaison inexistante</li>
                </ul>
              </section>
            </>
          )}

          {config && !splitMode && !config.hasVariants && (
            <section aria-labelledby="single-title">
              <h3 id="single-title" className="mb-2 text-xs font-black uppercase tracking-wide text-ink-700">Stock du produit</h3>
              {editableSingle(config).map((v) => (
                <div key={v.id} className="flex flex-wrap items-center gap-6 rounded-xl border border-ink-200 p-4">
                  <label className="block">
                    <span className="mb-1 block text-xs font-bold uppercase text-ink-700">Quantité</span>
                    <QtyInput id={v.id} label="Quantité en stock" raw={draft.qty[v.id] ?? String(v.onHand)} original={v.onHand} changed={analysis!.changedQty.has(v.id)} invalid={analysis!.invalid.has(v.id)} disabled={saving} onChange={(raw) => setQty(v.id, raw)} col={0} row={0} wide />
                  </label>
                  <div>
                    <span className="mb-1 block text-xs font-bold uppercase text-ink-700">Disponibilité à la vente</span>
                    <AvailabilitySwitch label="Disponible à la vente" on={draft.active[v.id] ?? v.active} changed={analysis!.changedActive.has(v.id)} soldOut={(parseQty(draft.qty[v.id] ?? '') ?? v.onHand) === 0} disabled={saving} onToggle={() => toggle(v.id)} wide />
                  </div>
                </div>
              ))}
              {canSplit && (
                <button type="button" className="mt-4 text-sm font-bold text-blue-700 hover:underline" onClick={() => { setSplitMode(true); setAlloc({}); setError(''); }}>
                  Répartir par taille et couleur →
                </button>
              )}
            </section>
          )}
        </div>

        <footer className="border-t border-ink-200 bg-ink-100/60 px-6 py-4">
          {confirmDiscard ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-bold text-ink-900">Vous avez des modifications non enregistrées.</p>
              <div className="flex gap-2">
                <button type="button" className="btn-primary" onClick={() => setConfirmDiscard(false)}>Continuer la modification</button>
                <button type="button" className="btn-ghost" onClick={() => onClose(false)}>Quitter sans enregistrer</button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end gap-3">
              {splitMode && <button type="button" className="btn-ghost mr-auto" disabled={saving} onClick={() => { setSplitMode(false); setError(''); }}>← Retour</button>}
              <button type="button" className="btn-ghost" disabled={saving} onClick={requestClose}>Annuler</button>
              <button type="button" className="btn-primary disabled:opacity-50" disabled={!canSave || saving} onClick={save}>
                {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
              </button>
            </div>
          )}
        </footer>
      </div>
    </dialog>
  );
}

const editableSingle = (config: StockConfig): StockVariantRow[] => config.variants.filter((v) => !v.obsoleteByOptions).slice(0, 1);

type CellCtx = { row: number; col: number };

function Matrix({ grid, renderCell, rowTotal, colTotal, grand }: {
  grid: ReturnType<typeof buildGrid>;
  renderCell: (variant: StockVariantRow, ctx: CellCtx) => React.ReactNode;
  rowTotal?: (colorKey: string) => number;
  colTotal?: (sizeKey: string) => number;
  grand?: number;
}) {
  const key = (v: string) => v.trim().normalize('NFC').toLocaleLowerCase('fr');
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-200">
      <table className="w-full text-center text-sm">
        <thead className="bg-ink-100">
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-ink-100 p-2.5 text-left text-xs font-bold uppercase text-ink-700">Couleur / Taille</th>
            {grid.sizes.map((s) => <th key={key(s)} scope="col" className="min-w-16 p-2.5 text-xs font-black uppercase">{s || 'Standard'}</th>)}
            {rowTotal && <th scope="col" className="bg-blue-50 p-2.5 text-xs font-black uppercase text-blue-900">Total</th>}
          </tr>
        </thead>
        <tbody>
          {grid.colors.map((color, row) => (
            <tr key={key(color)} className="border-t border-ink-200">
              <th scope="row" className="sticky left-0 bg-white p-2.5 text-left text-sm font-bold text-ink-900">{color || 'Standard'}</th>
              {grid.sizes.map((size, col) => {
                const v = grid.at(size, color);
                return <td key={key(size)} className="border-l border-ink-100 p-1.5">{v ? renderCell(v, { row, col }) : <span className="text-slate-300" aria-label="Combinaison inexistante">—</span>}</td>;
              })}
              {rowTotal && <td className="border-l border-ink-100 bg-blue-50/60 p-2.5 font-black text-blue-900">{rowTotal(key(color))}</td>}
            </tr>
          ))}
        </tbody>
        {colTotal && (
          <tfoot className="border-t border-ink-200 bg-blue-50 font-black text-blue-900">
            <tr>
              <th scope="row" className="sticky left-0 bg-blue-50 p-2.5 text-left text-xs uppercase">Total</th>
              {grid.sizes.map((s) => <td key={key(s)} className="p-2.5">{colTotal(key(s))}</td>)}
              <td className="p-2.5" aria-label="Total général">{grand}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function QtyInput({ id, label, raw, original, changed, invalid, disabled, onChange, row, col, wide }: {
  id: string; label: string; raw: string; original: number; changed: boolean; invalid: boolean; disabled: boolean;
  onChange: (raw: string) => void; row: number; col: number; wide?: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <input
        aria-label={label}
        aria-invalid={invalid}
        data-cell={`${row}:${col}`}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        value={raw}
        disabled={disabled}
        onFocus={(e) => e.target.select()}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          const next = e.currentTarget.closest('dialog')?.querySelector<HTMLInputElement>(`input[data-cell="${row + (e.shiftKey ? -1 : 1)}:${col}"]`);
          next?.focus();
        }}
        className={`${wide ? 'w-28' : 'w-16'} rounded-lg border px-1.5 py-1.5 text-center text-sm font-bold tabular-nums outline-none focus:ring-2 focus:ring-blue-300 ${
          invalid ? 'border-red-400 bg-red-50 text-red-700' : changed ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-ink-200 bg-white text-ink-900'
        }`}
        data-id={id}
      />
      {changed && !invalid && <span className="mt-0.5 text-[10px] font-semibold text-amber-700">était {original}</span>}
      {invalid && <span className="mt-0.5 text-[10px] font-semibold text-red-600">nombre entier ≥ 0</span>}
    </div>
  );
}

function AvailabilitySwitch({ label, on, changed, soldOut, disabled, onToggle, wide }: {
  label: string; on: boolean; changed: boolean; soldOut: boolean; disabled: boolean; onToggle: () => void; wide?: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${label} : ${on ? 'disponible à la vente' : 'désactivée'}`}
        disabled={disabled}
        onClick={onToggle}
        className={`${wide ? 'h-10 w-28' : 'h-8 w-12'} grid place-items-center rounded-lg border-2 transition ${
          on ? 'border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600' : 'border-red-200 bg-red-50 text-red-500 hover:bg-red-100'
        } ${changed ? 'ring-2 ring-amber-400 ring-offset-1' : ''}`}
      >
        {on ? <Check size={16} /> : <X size={16} />}
      </button>
      {on && soldOut && <span className="mt-0.5 text-[10px] font-bold text-red-600">Épuisé</span>}
    </div>
  );
}

function SplitGrid({ rows, alloc, setAlloc }: { rows: StockRow[]; alloc: Record<string, string>; setAlloc: (fn: (a: Record<string, string>) => Record<string, string>) => void }) {
  const norm = (v: string) => v.trim().normalize('NFC').toLocaleLowerCase('fr');
  const sizes = [...new Map(rows.map((r) => [norm(r.size), r.size])).values()];
  const colors = [...new Map(rows.map((r) => [norm(r.color), r.color])).values()];
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-200">
      <table className="w-full text-center text-sm">
        <thead className="bg-ink-100"><tr><th className="sticky left-0 bg-ink-100 p-2.5 text-left text-xs font-bold uppercase text-ink-700">Couleur / Taille</th>{sizes.map((s) => <th key={norm(s)} className="min-w-16 p-2.5 text-xs font-black uppercase">{s}</th>)}</tr></thead>
        <tbody>
          {colors.map((c) => (
            <tr key={norm(c)} className="border-t border-ink-200">
              <th className="sticky left-0 bg-white p-2.5 text-left font-bold">{c}</th>
              {sizes.map((s) => {
                const k = `${s}\u0000${c}`;
                return (
                  <td key={norm(s)} className="border-l border-ink-100 p-1.5">
                    <input
                      aria-label={`${c} ${s}`}
                      inputMode="numeric"
                      value={alloc[k] ?? ''}
                      placeholder="0"
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => { if (/^\d{0,9}$/.test(e.target.value)) setAlloc((a) => ({ ...a, [k]: e.target.value })); }}
                      className="w-16 rounded-lg border border-ink-200 px-1.5 py-1.5 text-center text-sm font-bold tabular-nums outline-none focus:ring-2 focus:ring-blue-300"
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
