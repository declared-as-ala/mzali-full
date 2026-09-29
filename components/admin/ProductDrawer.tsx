'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Drawer from './Drawer';
import MultiCheckSelect from './MultiCheckSelect';
import ImageUploader from './ImageUploader';
import ProductImageManager from './ProductImageManager';
import { useProductMedia } from './useProductMedia';
import NumberField from './NumberField';
import { Save, Copy, Trash2, Plus, X, Upload, Boxes, AlertTriangle, ArrowUp, ArrowDown } from 'lucide-react';
import type { Product, ProductBundle } from '@/types';
import { adminLoginHref } from '@/lib/admin-nav';
import { useAdminHref } from '@/lib/admin-nav-context';
import {
  buildCreatePayload,
  buildPatch,
  createLatestGuard,
  EMPTY_FORM,
  formFromProduct,
  formSignature,
  isFormDirty,
  type EditorForm,
} from '@/lib/product-editor';

type Tab = 'description' | 'options' | 'bundles' | 'related' | 'reviews';
type FormState = EditorForm;

const PRODUCT_DRAFT_PREFIX = 'mzali_product_draft:';
function productDraftKey(productId?: string | null) { return `${PRODUCT_DRAFT_PREFIX}${productId ?? 'new'}`; }
/** A draft is only valid for the exact server state it was made from (`base`).
 *  If the product changed since (stock screen, options, another admin, ...) or
 *  the draft predates this format, it is discarded instead of overriding the
 *  server's data with stale (or blank) values. */
function loadProductDraft(productId: string | null | undefined, base: string): FormState | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(productDraftKey(productId)) ?? 'null') as { base?: string; form?: FormState } | null;
    return raw && raw.base === base && raw.form ? raw.form : null;
  } catch { return null; }
}
function clearProductDraft(productId?: string | null) {
  try { sessionStorage.removeItem(productDraftKey(productId)); } catch { /* ignore */ }
}

type Props = {
  open: boolean;
  onClose: () => void;
  productId?: string | null;
  onSaved?: (p: Product) => void;
};

/**
 * The editor is mounted only while the drawer is open and is keyed by product:
 * opening product B always builds a brand-new editor (fresh form, fresh media
 * state, fresh request guard). Nothing from product A can survive into B.
 */
export default function ProductDrawer({ open, onClose, productId, onSaved }: Props) {
  if (!open) return null;
  return <ProductEditor key={productId ?? 'new'} productId={productId ?? null} onClose={onClose} onSaved={onSaved} />;
}

type Banner = { kind: 'error' | 'conflict'; msg: string } | null;

function ProductEditor({ productId, onClose, onSaved }: { productId: string | null; onClose: () => void; onSaved?: (p: Product) => void }) {
  const adminHref = useAdminHref();
  const isEdit = productId !== null;
  const media = useProductMedia();
  const mediaReset = media.reset; // stable (useCallback) — safe as an effect dependency

  const [shown, setShown] = useState(false);
  // `base` = what the server last returned; `form` = what the admin is editing.
  // Both are null while an existing product is loading — the form is never a
  // blank placeholder that could be mistaken for (or saved as) real data.
  const [base, setBase] = useState<EditorForm | null>(isEdit ? null : EMPTY_FORM);
  const [form, setForm] = useState<EditorForm | null>(isEdit ? null : structuredCloneForm(EMPTY_FORM));
  const [revision, setRevision] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const savingRef = useRef(false);
  const [banner, setBanner] = useState<Banner>(null);
  const [tab, setTab] = useState<Tab>('description');
  const [confirmClose, setConfirmClose] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; companyName: string }[]>([]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true)); // lets the slide-in transition run
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    fetch('/api/admin/categories').then(async (r) => r.ok && setCategories(await r.json())).catch(() => {});
    fetch('/api/admin/suppliers').then(async (r) => r.ok && setSuppliers(await r.json())).catch(() => {});
  }, []);

  // Load the product in ONE request (options, bundles, prices, purchase price, revision...).
  // Only the latest request may apply its result, and the response must be for THIS product.
  useEffect(() => {
    const guard = createLatestGuard();
    const req = guard.begin();
    setLoadError(null);
    if (!productId) {
      setBase(EMPTY_FORM);
      setForm(loadProductDraft(null, formSignature(EMPTY_FORM)) ?? structuredCloneForm(EMPTY_FORM));
      mediaReset([]);
      return () => guard.cancel();
    }
    setBase(null);
    setForm(null);
    fetch(`/api/admin/products/${productId}`, { signal: req.signal, cache: 'no-store' })
      .then((r) => {
        if (r.status === 401) {
          window.location.href = adminLoginHref(`from=${encodeURIComponent(window.location.pathname + window.location.search)}`);
          throw new Error('Session expirée');
        }
        if (!r.ok) throw new Error('Impossible de charger le produit');
        return r.json() as Promise<Product>;
      })
      .then((p) => {
        if (!req.isCurrent() || p.id !== productId) return;
        const server = formFromProduct(p);
        setBase(server);
        setRevision(p.revision ?? 0);
        setForm(loadProductDraft(productId, formSignature(server)) ?? formFromProduct(p));
        mediaReset(p.images);
      })
      .catch((e: unknown) => {
        if (!req.isCurrent() || (e instanceof DOMException && e.name === 'AbortError')) return;
        setLoadError(e instanceof Error ? e.message : 'Impossible de charger le produit');
      });
    return () => guard.cancel();
  }, [productId, reloadTick, mediaReset]);

  const dirty = Boolean(form && base && (isFormDirty(base, form) || media.isDirty));

  // Draft recovery: only for a fully loaded editor, and only while there is something to recover.
  useEffect(() => {
    if (!form || !base) return;
    const timer = window.setTimeout(() => {
      try {
        if (!isFormDirty(base, form)) clearProductDraft(productId);
        else sessionStorage.setItem(productDraftKey(productId), JSON.stringify({ base: formSignature(base), form }));
      } catch { /* best effort */ }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [form, base, productId]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const requestClose = useCallback(() => {
    if (saving || duplicating) return;
    if (dirty) { setConfirmClose(true); return; }
    onClose();
  }, [dirty, duplicating, onClose, saving]);

  function up<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => {
      if (!f) return f;
      // With no sale price, "Prix" simply follows "Prix avant remise".
      if (k === 'regularPrice' && f.salePrice === f.regularPrice) return { ...f, regularPrice: v as number, salePrice: v as number };
      return { ...f, [k]: v };
    });
  }

  async function save() {
    if (!form || !base || savingRef.current) return;
    if (!form.name.trim()) { setBanner({ kind: 'error', msg: 'Le nom du produit est obligatoire.' }); return; }
    if (media.saveBlockReason) { setBanner({ kind: 'error', msg: media.saveBlockReason }); return; }
    savingRef.current = true;
    setSaving(true);
    setBanner(null);
    try {
      const body: Record<string, unknown> = isEdit ? buildPatch(base, form) : buildCreatePayload(form);
      if (!isEdit || media.isDirty) {
        body.media = media.payload;
        body.imageIds = media.payload.map((item) => item.mediaId);
      }
      if (isEdit) {
        if (Object.keys(body).length === 0) { onClose(); return; }
        body.expectedRevision = revision;
      }
      const res = await fetch(isEdit ? `/api/admin/products/${productId}` : '/api/admin/products', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', 'x-request-id': crypto.randomUUID() },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setBanner({ kind: 'conflict', msg: (data as { error?: string }).error ?? 'Ce produit a été modifié depuis son ouverture. Rechargez les données avant d’enregistrer.' });
        return;
      }
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Erreur');
      clearProductDraft(productId);
      onSaved?.(data as Product);
      onClose();
    } catch (e) {
      setBanner({ kind: 'error', msg: `Échec de l’enregistrement : ${e instanceof Error ? e.message : 'erreur inconnue'}` });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function duplicate() {
    if (!productId || saving || duplicating || dirty) return;
    setDuplicating(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/admin/products/${productId}/duplicate`, { method: 'POST', headers: { 'x-request-id': crypto.randomUUID() } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Erreur');
      onSaved?.(data as Product);
      onClose();
    } catch (e) {
      setBanner({ kind: 'error', msg: `Échec de la duplication : ${e instanceof Error ? e.message : 'erreur inconnue'}` });
    } finally {
      setDuplicating(false);
    }
  }

  function reloadFromServer() {
    clearProductDraft(productId);
    setBanner(null);
    setReloadTick((t) => t + 1);
  }

  const ready = Boolean(form && base);
  const busy = saving || duplicating;

  return (
    <>
      <Drawer
        open={shown}
        onClose={requestClose}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span>{isEdit ? `Modifier ${form?.name ?? ''}`.trim() : 'Ajouter un produit'}</span>
            {dirty && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">Modifications non enregistrées</span>}
          </span>
        }
        actions={
          <>
            <select
              aria-label="Statut"
              disabled={!ready || busy}
              value={form?.status ?? 'published'}
              onChange={(e) => up('status', e.target.value as FormState['status'])}
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 focus:outline-none disabled:opacity-50"
            >
              <option value="published">Affiché</option>
              <option value="draft">Brouillon</option>
              <option value="private">Privé</option>
            </select>
            {isEdit && (
              <button
                type="button"
                onClick={duplicate}
                disabled={!ready || busy || dirty}
                title={dirty ? 'Enregistrez d’abord : la copie reprend la version enregistrée' : undefined}
                className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm font-bold text-ink-900 hover:bg-ink-100 disabled:opacity-50"
              >
                <Copy size={14} /> {duplicating ? 'Duplication…' : 'Dupliquer'}
              </button>
            )}
            <button
              type="button"
              onClick={save}
              disabled={!ready || busy || Boolean(media.saveBlockReason)}
              title={media.saveBlockReason ?? undefined}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white shadow-soft hover:bg-brand-600 disabled:opacity-50"
            >
              <Save size={14} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </>
        }
      >
        {loadError ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
            <AlertTriangle className="text-red-500" />
            <p className="text-sm font-bold text-ink-900">{loadError}</p>
            <p className="text-xs text-ink-700">Le produit n’a pas été modifié. Réessayez.</p>
            <button type="button" onClick={reloadFromServer} className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600">Réessayer</button>
          </div>
        ) : !form || !base ? (
          <EditorSkeleton />
        ) : (
          <div className="mx-auto max-w-[1040px] space-y-5">
            {banner && (
              <div role="alert" className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${banner.kind === 'conflict' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-red-200 bg-red-50 text-red-800'}`}>
                <span className="font-semibold">{banner.msg}</span>
                {banner.kind === 'conflict' && (
                  <button type="button" onClick={reloadFromServer} className="rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700">Recharger les données</button>
                )}
              </div>
            )}

            <Card title="Images du produit">
              <ProductImageManager
                items={media.items}
                onAddFiles={media.addFiles}
                onRemove={media.remove}
                onRetry={media.retry}
                onReorder={media.reorder}
                onSetPrimary={media.setPrimary}
              />
            </Card>

            <Card title="Informations générales">
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Nom du produit"><input className="input" value={form.name} onChange={(e) => up('name', e.target.value)} /></Field>
                <Field label="SKU"><input className="input" value={form.sku} onChange={(e) => up('sku', e.target.value)} /></Field>
                <Field label="Catégories">
                  <MultiCheckSelect
                    items={categories.map((c) => ({ id: c.id, name: c.name }))}
                    selected={form.categoryIds}
                    onChange={(ids) => up('categoryIds', ids)}
                    placeholder="Pas de catégories"
                  />
                </Field>
              </div>

              <fieldset className="mt-5">
                <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-700">Visibilité</legend>
                <div className="grid gap-2 md:grid-cols-3">
                  {([
                    ['published', 'Affiché en ligne', 'Visible sur le site.'],
                    ['private', 'Privé', 'Masqué du site.'],
                    ['draft', 'Brouillon', 'Non publié.'],
                  ] as const).map(([value, label, hint]) => (
                    <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm transition ${form.status === value ? 'border-brand-500 bg-brand-50' : 'border-ink-200 bg-white hover:border-brand-300'}`}>
                      <input type="radio" name="product-visibility" className="mt-1 accent-brand-500" checked={form.status === value} onChange={() => up('status', value)} />
                      <span><span className="block font-bold text-ink-900">{label}</span><span className="block text-xs text-ink-700">{hint}</span></span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                <input type="checkbox" checked={form.posOnly} onChange={(e) => up('posOnly', e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500" />
                <span>
                  <span className="block font-bold">POS uniquement</span>
                  <span className="mt-0.5 block text-amber-700">Ce produit n&apos;apparaîtra pas sur le site web (boutique, catégories, accueil) et ne pourra pas être commandé en ligne, mais reste disponible en caisse.</span>
                </span>
              </label>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                <span className="font-semibold">Stock et inventaire : géré dans les modules Stock.</span>
                {isEdit ? (
                  <a href={adminHref(`/stock-depot?productId=${productId}`)} className="inline-flex items-center gap-1.5 font-bold text-blue-600 hover:underline"><Boxes size={14} /> Gérer les stocks →</a>
                ) : (
                  <span>Enregistrez d’abord le produit.</span>
                )}
              </div>
            </Card>

            <Card title="Prix">
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Prix avant remise"><NumberField className="input" step={0.01} decimals={2} value={form.regularPrice} onChange={(v) => up('regularPrice', v)} /></Field>
                <Field label="Prix de vente"><NumberField className="input" step={0.01} decimals={2} value={form.salePrice} onChange={(v) => up('salePrice', v)} /></Field>
                <Field label="Prix d'achat"><NumberField className="input" step={0.01} decimals={2} value={form.purchasePrice} onChange={(v) => up('purchasePrice', v)} /></Field>
              </div>
              <div className="mt-4 grid gap-4 border-t border-ink-100 pt-4 md:grid-cols-3">
                <Field label="Fournisseur">
                  <select className="input" value={form.supplierId} onChange={(e) => up('supplierId', e.target.value)}>
                    <option value="">Aucun</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.companyName}</option>)}
                  </select>
                </Field>
                {form.supplierId && (
                  <div className="md:col-span-2">
                    <SupplierPriceCopyPicker supplierId={form.supplierId} onCopy={(priceMinor) => up('purchasePrice', priceMinor / 1000)} />
                  </div>
                )}
              </div>
            </Card>

            <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
              <nav className="flex flex-wrap gap-2 bg-brand-500 p-3" role="tablist">
                {([
                  ['description', 'Description'],
                  ['options', 'Options'],
                  ['bundles', 'Bundles'],
                  ['related', 'Produits associés'],
                  ['reviews', 'Avis'],
                ] as [Tab, string][]).map(([k, lbl]) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={tab === k}
                    onClick={() => setTab(k)}
                    className={`rounded-xl px-4 py-2 text-sm font-bold transition ${tab === k ? 'bg-white text-brand-500' : 'bg-white/15 text-white hover:bg-white/25'}`}
                  >
                    {lbl}
                  </button>
                ))}
              </nav>
              <div className="p-5">
                {tab === 'description' && <textarea rows={8} className="input" value={form.description} onChange={(e) => up('description', e.target.value)} placeholder="Description" />}
                {tab === 'options' && <OptionsTab options={form.options} onChange={(opts) => up('options', opts)} />}
                {tab === 'bundles' && <BundlesTab bundles={form.bundles} onChange={(b) => up('bundles', b)} />}
                {tab === 'related' && <RelatedTab selected={form.upsellIds} onChange={(ids) => up('upsellIds', ids)} />}
                {tab === 'reviews' && <p className="text-sm text-ink-700">Les avis client s&apos;afficheront ici une fois disponibles depuis l&apos;API.</p>}
              </div>
            </section>
          </div>
        )}
      </Drawer>

      {confirmClose && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/50 p-4" role="alertdialog" aria-modal="true" aria-labelledby="unsaved-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 id="unsaved-title" className="text-base font-black text-ink-900">Vous avez des modifications non enregistrées.</h3>
            <p className="mt-1 text-sm text-ink-700">Si vous quittez maintenant, ces modifications seront perdues.</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" autoFocus onClick={() => setConfirmClose(false)} className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600">Continuer la modification</button>
              <button type="button" onClick={() => { clearProductDraft(productId); setConfirmClose(false); onClose(); }} className="rounded-xl border border-ink-200 bg-white px-4 py-2 text-sm font-bold text-ink-900 hover:bg-ink-100">Quitter sans enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function structuredCloneForm(form: EditorForm): EditorForm {
  return JSON.parse(JSON.stringify(form)) as EditorForm;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-ink-200 bg-white">
      <header className="border-b border-ink-200 px-5 py-3">
        <h3 className="text-sm font-black uppercase tracking-wide text-ink-900">{title}</h3>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function EditorSkeleton() {
  return (
    <div className="mx-auto max-w-[1040px] space-y-5" aria-busy="true" aria-label="Chargement du produit">
      {[180, 260, 150, 220].map((h, i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-ink-200 bg-white p-5">
          <div className="mb-4 h-3 w-40 rounded bg-ink-100" />
          <div className="rounded-xl bg-ink-100" style={{ height: h - 60 }} />
        </div>
      ))}
    </div>
  );
}

function RelatedTab({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch('/api/admin/products-picker').then((r) => r.json()).then((d: { id: string; name: string }[]) => {
      setItems(d.map((p) => ({ id: p.id, name: p.name })));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);
  if (loading) return (
    <div className="flex items-center gap-2 py-3 text-xs text-ink-700 font-bold">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-ink-200 border-t-brand-500" />
      <span>Chargement des produits associés...</span>
    </div>
  );
  return (
    <Field label="Produits associés">
      <MultiCheckSelect items={items} selected={selected} onChange={onChange} placeholder="Aucun produit associé" />
    </Field>
  );
}

function OptionsTab({ options, onChange }: { options: FormState['options']; onChange: (v: FormState['options']) => void }) {
  function update(i: number, patch: Partial<FormState['options'][number]>) {
    onChange(options.map((o, idx) => idx === i ? { ...o, ...patch } : o));
  }
  function remove(i: number) { onChange(options.filter((_, idx) => idx !== i)); }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= options.length) return;
    const next = options.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }
  function add() { onChange([...options, { label: '', type: 'text', values: [] }]); }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button type="button" onClick={add} className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600">
          <Plus size={14} /> Ajouter une option
        </button>
      </div>

      {options.map((o, i) => (
        <div key={i} className="grid gap-3 rounded-xl border border-ink-200 p-4 md:grid-cols-[1fr_1fr_2fr_auto]">
          <Field label="Nom de l'option"><input className="input" value={o.label} onChange={(e) => update(i, { label: e.target.value })} /></Field>
          <Field label="Type">
            <select className="input" value={o.type} onChange={(e) => update(i, { type: e.target.value as 'text' | 'select' | 'radio' })}>
              <option value="text">Texte</option>
              <option value="select">Select</option>
              <option value="radio">Radio</option>
            </select>
          </Field>
          <Field label="Valeurs">
            <ChipsInput values={o.values} onChange={(values) => update(i, { values })} />
          </Field>
          <div className="flex items-end gap-1">
            <button type="button" aria-label="Monter l'option" disabled={i === 0} onClick={() => move(i, -1)} className="rounded-lg p-2 text-ink-600 hover:bg-ink-100 disabled:opacity-30"><ArrowUp size={16} /></button>
            <button type="button" aria-label="Descendre l'option" disabled={i === options.length - 1} onClick={() => move(i, 1)} className="rounded-lg p-2 text-ink-600 hover:bg-ink-100 disabled:opacity-30"><ArrowDown size={16} /></button>
            <button type="button" aria-label="Supprimer l'option" onClick={() => remove(i)} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
          </div>
        </div>
      ))}

      {options.length === 0 && <p className="text-sm text-ink-700">Aucune option. Cliquez sur « Ajouter une option ».</p>}
    </div>
  );
}

function ChipsInput({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState('');
  function commit() {
    const v = text.trim();
    if (!v) return;
    if (values.some((x) => x.trim().toLowerCase() === v.toLowerCase())) { setText(''); return; }
    onChange([...values, v]);
    setText('');
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 py-2">
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-md bg-brand-100 px-2 py-1 text-xs font-bold text-brand-700">
          {v}
          <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="text-brand-700/70 hover:text-red-500"><X size={12} /></button>
        </span>
      ))}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); } }}
        onBlur={commit}
        className="min-w-[120px] flex-1 bg-transparent text-sm outline-none"
        placeholder="Écrivez ici"
      />
    </div>
  );
}

function BundlesTab({ bundles, onChange }: { bundles: ProductBundle[]; onChange: (v: ProductBundle[]) => void }) {
  function update(i: number, patch: Partial<ProductBundle>) {
    onChange(bundles.map((b, idx) => idx === i ? { ...b, ...patch } : b));
  }
  function remove(i: number) { onChange(bundles.filter((_, idx) => idx !== i)); }
  function add() {
    onChange([...bundles, {
      id: String(Date.now()),
      name: `Bundle ${bundles.length + 1}`,
      label: '',
      regularPrice: 0, price: 0, deliveryPrice: 0, quantity: 1,
      badgeColor: 'red', isDefault: false,
    }]);
  }
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button type="button" onClick={add} className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600">
          <Plus size={14} /> Ajouter un bundle
        </button>
      </div>
      {bundles.map((b, i) => (
        <article key={b.id} className="rounded-xl border border-ink-200 p-4">
          <header className="mb-4 flex items-center justify-between">
            <h4 className="text-sm font-black text-ink-900">Bundle {i + 1}</h4>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs font-bold">
                <input type="checkbox" checked={b.isDefault} onChange={(e) => update(i, { isDefault: e.target.checked })} className="h-4 w-4 accent-brand-500" />
                Par défaut
              </label>
              <button type="button" onClick={() => remove(i)} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
            </div>
          </header>

          <div className="grid gap-3 md:grid-cols-[1.4fr_140px]">
            <div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Nom"><input className="input" value={b.name} onChange={(e) => update(i, { name: e.target.value })} /></Field>
                <Field label="Libellé"><input className="input" value={b.label ?? ''} onChange={(e) => update(i, { label: e.target.value })} /></Field>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <Field label="Prix avant remise"><NumberField className="input" step={0.01} decimals={2} value={b.regularPrice} onChange={(v) => update(i, { regularPrice: v })} /></Field>
                <Field label="Prix"><NumberField className="input" step={0.01} decimals={2} value={b.price} onChange={(v) => update(i, { price: v })} /></Field>
                <Field label="Frais de livraison"><NumberField className="input" step={0.01} decimals={2} value={b.deliveryPrice} onChange={(v) => update(i, { deliveryPrice: v })} /></Field>
                <Field label="Quantité"><NumberField className="input" min={1} blankOnZero={false} value={b.quantity} onChange={(v) => update(i, { quantity: Math.max(1, v) })} /></Field>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                <span className="font-bold text-ink-700">Couleur de la marque de remise :</span>
                {(['red', 'green', 'blue', 'purple'] as const).map((c) => (
                  <label key={c} className="inline-flex cursor-pointer items-center gap-1.5">
                    <input
                      type="radio"
                      name={`badge-${b.id}`}
                      checked={b.badgeColor === c}
                      onChange={() => update(i, { badgeColor: c })}
                    />
                    <span className={`rounded px-2 py-0.5 text-[11px] font-black text-white ${c === 'red' ? 'bg-red-500' : c === 'green' ? 'bg-emerald-500' : c === 'blue' ? 'bg-blue-500' : 'bg-brand-500'}`}>
                      -{Math.max(0, Math.round(((b.regularPrice - b.price) / Math.max(1, b.regularPrice)) * 100))}% OFF
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-bold uppercase text-ink-700">Image</span>
              <div className="relative">
                {b.imageUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={b.imageUrl} alt="" className="h-32 w-full rounded-xl object-cover" />
                )}
                <ImageUploader
                  onUploaded={(img) => update(i, { imageUrl: img.url })}
                  className={`${b.imageUrl ? 'absolute inset-0 bg-black/35 text-white opacity-0 transition hover:opacity-100 rounded-xl flex items-center justify-center' : 'flex h-32 w-full items-center justify-center rounded-xl border-2 border-dashed border-ink-200 bg-ink-100 text-xs font-bold text-ink-700 transition hover:border-brand-300 hover:bg-ink-200'}`}
                >
                  {b.imageUrl ? (
                    <span className="flex items-center gap-1.5 rounded-lg bg-white/95 px-3 py-1.5 text-xs font-bold text-ink-900">
                      <Upload size={14} className="text-brand-500" /> Remplacer
                    </span>
                  ) : (
                    <span className="flex flex-col items-center gap-1">
                      <Upload size={18} className="text-brand-500" />
                      <span>400 × 400</span>
                    </span>
                  )}
                </ImageUploader>
              </div>
            </div>
          </div>
        </article>
      ))}
      {bundles.length === 0 && <p className="text-sm text-ink-700">Aucun bundle. Cliquez sur « Ajouter un bundle ».</p>}
    </div>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-700">{label}</span>
      {children}
    </label>
  );
}

type SupplierCatalogItem = { id: string; name: string; brand: string | null; size: string | null; color: string | null; purchasePriceMinor: number };

/** Lets the admin browse the selected supplier's own catalog and copy a
 *  price into the product's "Prix d'achat" with one click — never touches
 *  stock, just fills a number. */
function SupplierPriceCopyPicker({ supplierId, onCopy }: { supplierId: string; onCopy: (priceMinor: number) => void }) {
  const [items, setItems] = useState<SupplierCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/supplier-products?supplierId=${supplierId}&status=active`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: SupplierCatalogItem[]) => setItems(Array.isArray(rows) ? rows : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [supplierId]);

  const visible = items.filter((i) => !query || i.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div>
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-700">Copier depuis le catalogue fournisseur</span>
      {loading ? (
        <p className="text-xs text-ink-700">Chargement…</p>
      ) : !items.length ? (
        <p className="text-xs text-ink-700">Aucun produit dans le catalogue de ce fournisseur.</p>
      ) : (
        <div className="rounded-xl border border-ink-200 bg-white">
          <input
            className="input rounded-b-none border-0 border-b border-ink-200"
            placeholder="Rechercher un produit du fournisseur…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="max-h-40 overflow-y-auto divide-y divide-ink-100">
            {visible.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => onCopy(i.purchasePriceMinor)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-ink-100 transition"
              >
                <span className="font-semibold text-ink-900 truncate">
                  {i.name}{[i.brand, i.size, i.color].filter(Boolean).length > 0 ? ` — ${[i.brand, i.size, i.color].filter(Boolean).join(', ')}` : ''}
                </span>
                <span className="ml-2 shrink-0 font-mono font-bold text-brand-600">{(i.purchasePriceMinor / 1000).toFixed(3)} DT</span>
              </button>
            ))}
            {!visible.length && <p className="px-3 py-2 text-xs text-ink-700">Aucun résultat.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
