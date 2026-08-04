'use client';
import { useEffect, useState } from 'react';
import Drawer from './Drawer';
import MultiCheckSelect from './MultiCheckSelect';
import ImageUploader from './ImageUploader';
import NumberField from './NumberField';
import { Save, Copy, Trash2, Plus, X, GripVertical, Upload, Check, AlertCircle, Barcode, Boxes } from 'lucide-react';
import type { Product, ProductBundle } from '@/types';
import type { Variant } from '@/types/variant';
import { adminLoginHref } from '@/lib/admin-nav';
import { useAdminHref } from '@/lib/admin-nav-context';

type Tab = 'description' | 'options' | 'bundles' | 'variants' | 'related' | 'reviews';

type FormState = {
  name: string;
  sku: string;
  categoryIds: string[];
  manageStock: boolean;
  stockQuantity: number;
  regularPrice: number;
  salePrice: number;
  cost: number;
  deliveryPrice: number;
  deliveryCost: number;
  purchasePrice: number;
  supplierId: string;
  description: string;
  status: 'published' | 'draft' | 'private';
  images: { id: string; url: string }[];
  options: { label: string; type: 'text' | 'select' | 'radio'; values: string[] }[];
  bundles: ProductBundle[];
  upsellIds: string[];
  /** Sold only at the till — hidden from the storefront, still sellable in POS. */
  posOnly: boolean;
};

const EMPTY: FormState = {
  name: '', sku: '', categoryIds: [], manageStock: false, stockQuantity: 0,
  regularPrice: 0, salePrice: 0, cost: 0, deliveryPrice: 0, deliveryCost: 0,
  purchasePrice: 0, supplierId: '',
  description: '', status: 'published', images: [],
  options: [], bundles: [], upsellIds: [], posOnly: false,
};

type Props = {
  open: boolean;
  onClose: () => void;
  productId?: string | null;
  onSaved?: (p: Product) => void;
};

export default function ProductDrawer({ open, onClose, productId, onSaved }: Props) {
  const adminHref = useAdminHref();
  const isEdit = Boolean(productId);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('description');
  const [form, setForm] = useState<FormState>(EMPTY);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; companyName: string }[]>([]);
  const [variantId, setVariantId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (!categories.length) {
      fetch('/api/admin/categories').then(async (r) => r.ok && setCategories(await r.json())).catch(() => {});
    }
    if (!suppliers.length) {
      fetch('/api/admin/suppliers').then(async (r) => r.ok && setSuppliers(await r.json())).catch(() => {});
    }
    if (productId) {
      setLoading(true);
      Promise.all([
        fetch(`/api/admin/products/${productId}`).then((r) => {
          if (r.status === 401) {
            window.location.href = adminLoginHref(`from=${encodeURIComponent(window.location.pathname + window.location.search)}`);
            throw new Error('Session expirée');
          }
          if (!r.ok) throw new Error('Erreur de chargement');
          return r.json() as Promise<Product>;
        }),
        fetch(`/api/admin/inventory/variants?productId=${productId}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      ])
        .then(([p, variants]: [Product, Variant[]]) => {
          const options = (p.meta?._mzem_options as FormState['options']) ?? [];
          const variant = variants[0] ?? null;
          setVariantId(variant?.id ?? null);
          setForm({
            name: p.name,
            sku: (p.meta?._sku as string) ?? '',
            categoryIds: p.categoryIds,
            manageStock: p.stockQuantity !== null,
            stockQuantity: p.stockQuantity ?? 0,
            regularPrice: p.regularPrice,
            salePrice: p.salePrice ?? p.price,
            cost: Number(p.meta?._mzem_cost ?? 0),
            deliveryPrice: Number(p.meta?._mzem_delivery_price ?? 0),
            deliveryCost: Number(p.meta?._mzem_delivery_cost ?? 0),
            purchasePrice: variant?.purchasePriceMinor != null ? variant.purchasePriceMinor / 1000 : 0,
            supplierId: p.supplierId ?? '',
            description: p.description,
            status: p.status,
            images: p.images.map((i) => ({ id: i.id, url: i.url })),
            options: Array.isArray(options) ? options.map((o) => ({
              label: o.label,
              type: o.type,
              values: typeof (o as unknown as { values: string }).values === 'string'
                ? String((o as unknown as { values: string }).values).split(',').map((s) => s.trim()).filter(Boolean)
                : (o.values as unknown as string[]),
            })) : [],
            bundles: p.bundles,
            upsellIds: p.upsellIds,
            posOnly: p.posOnly ?? false,
          });
        })
        .catch(() => alert('Erreur de chargement du produit'))
        .finally(() => setLoading(false));
    } else {
      setForm(EMPTY);
      setVariantId(null);
    }
    setTab('description');
  }, [open, productId, categories.length, suppliers.length]);

  function up<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    if (!form.name.trim()) { alert('Nom obligatoire'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        sku: form.sku || undefined,
        status: form.status,
        description: form.description,
        regularPrice: form.regularPrice,
        salePrice: form.salePrice || null,
        cost: form.cost,
        deliveryPrice: form.deliveryPrice,
        deliveryCost: form.deliveryCost,
        supplierId: form.supplierId || null,
        manageStock: form.manageStock,
        stockQuantity: form.manageStock ? form.stockQuantity : null,
        categoryIds: form.categoryIds,
        imageIds: form.images.map((i) => i.id),
        upsellIds: form.upsellIds,
        bundles: form.bundles,
        options: form.options.map((o) => ({ label: o.label, type: o.type, values: o.values.join(',') })),
        posOnly: form.posOnly,
      };
      const url = isEdit ? `/api/admin/products/${productId}` : '/api/admin/products';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Erreur');
      const product: Product = await res.json();

      // Purchase price lives on the product's default variant, not the
      // product itself — ensure a variant exists (auto-created if this is a
      // brand-new product) then save the price onto it.
      const variantsRes = await fetch(`/api/admin/inventory/variants?productId=${product.id}`);
      const variants: Variant[] = variantsRes.ok ? await variantsRes.json() : [];
      const variant = variants[0];
      if (variant) {
        await fetch(`/api/admin/inventory/variants/${variant.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ purchasePriceMinor: Math.round(form.purchasePrice * 1000) }),
        });
      }

      onSaved?.(product);
      onClose();
    } catch (e) {
      alert(`Échec: ${e instanceof Error ? e.message : 'inconnu'}`);
    } finally {
      setSaving(false);
    }
  }

  async function duplicate() {
    if (!productId) return;
    const res = await fetch(`/api/admin/products/${productId}`);
    if (!res.ok) return alert('Erreur');
    const original: Product = await res.json();
    const payload = {
      name: `${original.name} (copie)`,
      status: 'draft' as const,
      description: original.description,
      regularPrice: original.regularPrice,
      salePrice: original.salePrice ?? null,
      categoryIds: original.categoryIds,
      imageIds: original.images.map((i) => i.id),
      bundles: original.bundles,
      posOnly: original.posOnly,
    };
    const create = await fetch('/api/admin/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!create.ok) return alert('Erreur de duplication');
    const p = await create.json();
    onSaved?.(p);
    onClose();
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? `Modifier ${form.name}`.trim() : 'Ajouter un produit'}
      actions={
        <>
          <select
            value={form.status}
            onChange={(e) => up('status', e.target.value as FormState['status'])}
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 focus:outline-none"
          >
            <option value="published">Affiché</option>
            <option value="draft">Brouillon</option>
            <option value="private">Privé</option>
          </select>
          {isEdit && (
            <button type="button" onClick={duplicate} className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm font-bold text-ink-900 hover:bg-ink-100">
              <Copy size={14} /> Dupliquer
            </button>
          )}
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white shadow-soft hover:bg-brand-600 disabled:opacity-50">
            <Save size={14} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </>
      }
    >
      {loading ? (
        <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
          <div className="relative mb-4 flex items-center justify-center">
            {/* Outer glowing ring */}
            <div className="absolute h-16 w-16 animate-ping rounded-full bg-brand-500/10 duration-1000" />
            {/* Spinning indicator */}
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-ink-100 border-t-brand-500" />
          </div>
          <h3 className="text-base font-black text-ink-900">Chargement du produit</h3>
          <p className="mt-1 text-xs text-ink-700">Récupération des informations de la boutique...</p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Détails */}
          <section className="rounded-2xl border border-ink-200 bg-white">
            <header className="border-b border-ink-200 px-5 py-3">
              <h3 className="text-sm font-black uppercase tracking-wide text-ink-900">Détails</h3>
            </header>
            <div className="p-5">
              <ImageGallery
                images={form.images}
                onReorder={(next) => up('images', next)}
                onRemove={(id) => up('images', form.images.filter((i) => i.id !== id))}
                onAdd={(img) => up('images', [...form.images, img])}
              />
              <p className="mb-5 mt-2 text-xs text-ink-700">
                Glissez-déposez pour réordonner. La première image est l&apos;image principale du produit.
              </p>

              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Nom du produit" className="md:col-span-1"><input className="input" value={form.name} onChange={(e) => up('name', e.target.value)} /></Field>
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

              <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-600">
                <span className="font-semibold">Stock et inventaire</span>
                <a
                  href={adminHref('/stock')}
                  className="inline-flex items-center gap-1.5 font-bold text-blue-600 hover:underline"
                >
                  <Boxes size={14} /> Gérer les stocks →
                </a>
              </div>

              <label className="mt-3 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.posOnly}
                  onChange={(e) => up('posOnly', e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                />
                <span>
                  <span className="block font-bold">Vendre uniquement en caisse (POS)</span>
                  <span className="block mt-0.5 text-amber-700">
                    Ce produit n&apos;apparaîtra pas sur le site web (boutique, catégories, accueil) et ne pourra pas être commandé en ligne — mais reste disponible en caisse.
                  </span>
                </span>
              </label>
            </div>
          </section>

          {/* Détails du prix */}
          <section className="rounded-2xl border border-ink-200 bg-white">
            <header className="flex items-center justify-between border-b border-ink-200 px-5 py-3">
              <h3 className="text-sm font-black uppercase tracking-wide text-ink-900">Détails du prix</h3>
              <button type="button" className="text-xs font-bold text-brand-500 hover:underline">Appliquer à toutes les options</button>
            </header>
            <div className="grid gap-4 p-5 md:grid-cols-3">
              <Field label="Prix avant remise"><NumberField className="input" step={0.01} decimals={2} value={form.regularPrice} onChange={(v) => up('regularPrice', v)} /></Field>
              <Field label="Prix"><NumberField className="input" step={0.01} decimals={2} value={form.salePrice} onChange={(v) => up('salePrice', v)} /></Field>
              <Field label="Prix d'achat"><NumberField className="input" step={0.01} decimals={2} value={form.purchasePrice} onChange={(v) => up('purchasePrice', v)} /></Field>
            </div>
            <div className="grid gap-4 border-t border-ink-100 p-5 md:grid-cols-3">
              <Field label="Fournisseur" className="md:col-span-1">
                <select className="input" value={form.supplierId} onChange={(e) => up('supplierId', e.target.value)}>
                  <option value="">Aucun</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.companyName}</option>)}
                </select>
              </Field>
              {form.supplierId && (
                <div className="md:col-span-2">
                  <SupplierPriceCopyPicker
                    supplierId={form.supplierId}
                    onCopy={(priceMinor) => up('purchasePrice', priceMinor / 1000)}
                  />
                </div>
              )}
            </div>
          </section>

          {/* Tabs */}
          <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
            <nav className="flex flex-wrap gap-2 bg-brand-500 p-3">
              {([
                ['description', 'Description'],
                ['options', 'Options'],
                ['bundles', 'Bundles'],
                ['variants', 'Variante'],
                ['related', 'Produits associés'],
                ['reviews', 'Avis'],
              ] as [Tab, string][]).map(([k, lbl]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className={`rounded-xl px-4 py-2 text-sm font-bold transition ${tab === k ? 'bg-white text-brand-500' : 'bg-white/15 text-white hover:bg-white/25'}`}
                >
                  {lbl}
                </button>
              ))}
            </nav>

            <div className="p-5">
              {tab === 'description' && (
                <textarea rows={8} className="input" value={form.description} onChange={(e) => up('description', e.target.value)} placeholder="Description" />
              )}
              {tab === 'options' && (
                <OptionsTab options={form.options} onChange={(opts) => up('options', opts)} />
              )}
              {tab === 'bundles' && (
                <BundlesTab bundles={form.bundles} onChange={(b) => up('bundles', b)} />
              )}
              {tab === 'variants' && (
                isEdit && productId
                  ? <VariantsTab productId={productId} />
                  : <p className="text-sm text-ink-700">Enregistrez le produit pour gérer sa variante (SKU, code-barres, stock).</p>
              )}
              {tab === 'related' && (
                <RelatedTab selected={form.upsellIds} onChange={(ids) => up('upsellIds', ids)} />
              )}
              {tab === 'reviews' && (
                <p className="text-sm text-ink-700">Les avis client s&apos;afficheront ici une fois disponibles depuis l&apos;API.</p>
              )}
            </div>
          </section>
        </div>
      )}
    </Drawer>
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
          <button type="button" onClick={() => remove(i)} className="self-end rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
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
    if (values.includes(v)) { setText(''); return; }
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

/**
 * Every product has exactly one auto-generated variant (see
 * docs/pos-platform/PLAN.md decision D7) — this tab edits its SKU,
 * barcode and price overrides, used by the POS/inventory modules starting
 * Sprint 2. It's a separate resource from the product form above, so it
 * saves independently rather than through the drawer's main "Enregistrer".
 */
function VariantsTab({ productId }: { productId: string }) {
  const [loading, setLoading] = useState(true);
  const [variant, setVariant] = useState<Variant | null>(null);
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/inventory/variants?productId=${encodeURIComponent(productId)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Variant[]) => {
        const v = rows[0] ?? null;
        setVariant(v);
        setSku(v?.sku ?? '');
        setBarcode(v?.barcode ?? '');
      })
      .catch(() => setVariant(null))
      .finally(() => setLoading(false));
  }, [productId]);

  async function save() {
    if (!variant) return;
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/inventory/variants/${variant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: sku.trim(), barcode: barcode.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Erreur');
      setVariant(data);
      setStatus({ kind: 'ok', msg: 'Variante enregistrée.' });
    } catch (e) {
      setStatus({ kind: 'err', msg: e instanceof Error ? e.message : 'Erreur' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs font-bold text-ink-700">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-ink-200 border-t-brand-500" />
        <span>Chargement de la variante...</span>
      </div>
    );
  }

  if (!variant) {
    return <p className="text-sm text-ink-700">Aucune variante générée pour ce produit pour le moment.</p>;
  }

  return (
    <div className="max-w-md space-y-4">
      <p className="flex items-start gap-2 rounded-xl bg-ink-100 px-3 py-2 text-xs leading-5 text-ink-700">
        <Barcode size={14} className="mt-0.5 flex-none text-brand-500" />
        Ce produit a une seule variante (stock et code-barres uniques). Le suivi par taille/couleur pourra être activé produit par produit plus tard si nécessaire.
      </p>
      <Field label="SKU"><input className="input" value={sku} onChange={(e) => setSku(e.target.value)} /></Field>
      <Field label="Code-barres">
        <input className="input" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Scannez ou saisissez le code-barres" />
      </Field>
      {status && (
        <p className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold ${status.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {status.kind === 'ok' ? <Check size={14} /> : <AlertCircle size={14} />}
          {status.msg}
        </p>
      )}
      <button type="button" onClick={save} disabled={saving} className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
        <Save size={14} /> {saving ? 'Enregistrement…' : 'Enregistrer la variante'}
      </button>
    </div>
  );
}

/**
 * Drag-and-drop reorderable image gallery (HTML5 DnD, no extra deps).
 * Each tile is draggable. Drop the dragged tile onto another to swap places.
 * The "+ upload" tile is appended at the end and not reorderable.
 */
function ImageGallery({
  images, onReorder, onRemove, onAdd,
}: {
  images: { id: string; url: string }[];
  onReorder: (next: { id: string; url: string }[]) => void;
  onRemove: (id: string) => void;
  onAdd: (img: { id: string; url: string }) => void;
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    const next = images.slice();
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    onReorder(next);
  }

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
      {images.map((img, i) => {
        const isDragged = dragFrom === i;
        const isTarget = dragOver === i && dragFrom !== null && dragFrom !== i;
        const isMain = i === 0;
        return (
          <div
            key={img.id}
            draggable
            onDragStart={(e) => {
              setDragFrom(i);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', String(i));
            }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(i); }}
            onDragLeave={() => setDragOver((cur) => (cur === i ? null : cur))}
            onDrop={(e) => {
              e.preventDefault();
              const from = dragFrom ?? Number(e.dataTransfer.getData('text/plain'));
              if (Number.isFinite(from)) move(from as number, i);
              setDragFrom(null); setDragOver(null);
            }}
            onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
            className={`group relative aspect-square cursor-grab overflow-hidden rounded-xl border bg-ink-100 transition active:cursor-grabbing ${
              isDragged ? 'border-brand-500 opacity-40' :
              isTarget ? 'border-brand-500 ring-2 ring-brand-300 scale-[1.04]' :
              'border-ink-200'
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt="" draggable={false} className="pointer-events-none h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onRemove(img.id)}
              className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-md bg-white/90 text-red-500 opacity-0 transition group-hover:opacity-100"
              aria-label="Supprimer"
            >
              <X size={12} />
            </button>
            <span
              className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-md bg-white/95 text-ink-700"
              aria-hidden
            >
              <GripVertical size={12} />
            </span>
            {isMain && (
              <span className="absolute bottom-1 left-1 rounded bg-brand-500 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
                Principale
              </span>
            )}
          </div>
        );
      })}
      <ImageUploader
        multiple
        onUploaded={(img) => onAdd(img)}
      />
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
