'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Drawer from './Drawer';
import NumberField from './NumberField';
import { Save, Trash2, Plus, Check, AlertTriangle } from 'lucide-react';
import { SITE, formatPrice } from '@/lib/site-config';
import { adminLoginHref } from '@/lib/admin-nav';
import type { OrderResponse, OrderStatus } from '@/types';

type ProductPickerItem = { id: string; name: string; price: number; image?: string };
type LineDraft = {
  productId: string;
  name: string;
  image?: string;
  qty: number;
  unitPrice: number;
  variation: Record<string, string>;     // per-slot variation (e.g. {size: 'm', color: 'noir'})
  bundleName?: string;                   // groups slots together under one bundle row
  slotIndex?: number;                    // 1-based slot index within the bundle
};

type ProductInfo = {
  options: { name: string; values: string[] }[];   // {name:'size', values:['s','m','l',...]}
  bundles: { id: string; name: string; quantity: number; price: number }[];
  image?: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'En attente',
  'en-attente': 'En attente',
  processing: 'En traitement',
  confirme: 'Confirmée',
  'on-hold': 'En pause',
  completed: 'Terminée',
  cancelled: 'Annulée',
  annule: 'Annulée',
  refunded: 'Remboursée',
  failed: 'Échouée',
  tentative: 'Tentative',
  'auto-draft': 'Brouillon',
  'checkout-draft': 'Abandonnée',
};
function labelFor(slug: string): string {
  return STATUS_LABEL[slug] ?? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Mirrors backend/src/orders/order-status.ts's COMMIT_STATUSES — an order
 *  in one of these already had Depot stock physically deducted, so editing
 *  it needs a reason (the backend enforces this too; this is just the
 *  matching UI warning, not the real guard). */
const COMMITTED_STATUSES = new Set(['confirme', 'completed']);

function numberFromMeta(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}




/**
 * Parse a server-supplied order line (with chip-style attributes set by
 * the storefront) into the editable shape used by the drawer.
 *
 * Attributes can look like:
 *   [{ key: 'Offre', value: '2 Labsa : 80 D' }, { key: 'Item 1', value: 'size: m · color: noir' }]
 * For non-bundle lines they look like:
 *   [{ key: 'size', value: 'm' }, { key: 'color', value: 'noir' }]
 */
function parseLine(i: {
  productId: string; name: string; quantity: number; price: number;
  imageUrl?: string; attributes?: { key: string; value: string }[];
}): LineDraft {
  const attrs = i.attributes ?? [];
  const offer = attrs.find((a) => /^offre$/i.test(a.key));
  const itemAttr = attrs.find((a) => /^item\s*\d+/i.test(a.key));
  const variation: Record<string, string> = {};
  let slotIndex: number | undefined;

  if (itemAttr) {
    // Bundle slot. Parse "size: m · color: noir" into structured map.
    const m = itemAttr.key.match(/(\d+)/);
    slotIndex = m ? Number(m[1]) : undefined;
    for (const part of itemAttr.value.split(/[·;,]/)) {
      const [k, v] = part.split(':').map((s) => s?.trim());
      if (k && v) variation[k] = v;
    }
  } else {
    for (const a of attrs) {
      if (/^offre$/i.test(a.key)) continue;
      if (a.key && a.value && a.value !== '—') variation[a.key] = a.value;
    }
  }

  return {
    productId: i.productId,
    name: i.name,
    image: i.imageUrl,
    qty: i.quantity,
    unitPrice: i.price,
    variation,
    bundleName: offer?.value,
    slotIndex,
  };
}

type Props = {
  open: boolean;
  onClose: () => void;
  orderId?: string | null;
  onSaved?: (order: OrderResponse) => void;
  /** API base — pass '/api/employee' to scope to the current employee. Default: '/api/admin'. */
  apiBase?: '/api/admin' | '/api/employee';
};

export default function OrderDrawer({ open, onClose, orderId, onSaved, apiBase = '/api/admin' }: Props) {
  const isEdit = Boolean(orderId);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<ProductPickerItem[]>([]);
  const [statusList, setStatusList] = useState<string[]>([]);
  const [originalStatus, setOriginalStatus] = useState<string>('');
  const [status, setStatus] = useState<OrderStatus>('');
  const [attempts, setAttempts] = useState<number>(1);
  const [editReason, setEditReason] = useState('');
  const isSensitiveOrder = isEdit && COMMITTED_STATUSES.has(originalStatus);
  const [navexTracking, setNavexTracking] = useState<string>('');
  const [navexStatus, setNavexStatus] = useState<'idle' | 'sent' | 'failed'>('idle');
  const [navexMsg, setNavexMsg] = useState<string>('');
  const [fdTracking, setFdTracking] = useState<string>('');
  const [fdStatus, setFdStatus] = useState<'idle' | 'sent' | 'failed'>('idle');
  const [fdMsg, setFdMsg] = useState<string>('');
  const [axessTracking, setAxessTracking] = useState<string>('');
  const [axessStatus, setAxessStatus] = useState<'idle' | 'sent' | 'failed'>('idle');
  const [axessMsg, setAxessMsg] = useState<string>('');
  const [exchange, setExchange] = useState(false);
  const [shipping, setShipping] = useState(8);
  const [deliveryCompany, setDeliveryCompany] = useState('');
  const [privateNote, setPrivateNote] = useState('');
  const [customer, setCustomer] = useState({ firstName: '', phone: '', city: '', address: '', phone2: '', email: '', note: '' });
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [productInfo, setProductInfo] = useState<Record<string, ProductInfo>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);
  const saveInFlightRef = useRef(false);

  async function ensureProductInfo(pid: string): Promise<ProductInfo | null> {
    if (productInfo[pid]) {
      const info = productInfo[pid];
      setLines((prev) => prev.map((l) => {
        if (l.productId !== pid) return l;
        const normalizedVariation: Record<string, string> = {};
        for (const [k, v] of Object.entries(l.variation)) {
          const matchedOpt = info.options.find((opt) => opt.name.toLowerCase().trim() === k.toLowerCase().trim());
          if (matchedOpt) {
            normalizedVariation[matchedOpt.name] = v;
          } else {
            normalizedVariation[k] = v;
          }
        }
        return { ...l, image: info.image ?? l.image, variation: normalizedVariation };
      }));
      return info;
    }
    try {
      const res = await fetch(`${apiBase}/products/${pid}`);
      if (!res.ok) return null;
      const p = await res.json();
      const opts = (p.attributes ?? []).map((a: { name: string; options: string[] }) => ({
        name: a.name,
        values: a.options ?? [],
      }));
      const info: ProductInfo = {
        options: opts,
        bundles: (p.bundles ?? []).map((b: { id: string; name: string; quantity: number; price: number }) => ({
          id: b.id, name: b.name, quantity: b.quantity, price: b.price,
        })),
        // Historical order lines can retain an obsolete image host. Product
        // detail URLs are normalized by the API to the current public media
        // origin, so use the catalog image whenever the product still exists.
        image: p.images?.[0]?.url,
      };
      setProductInfo((prev) => ({ ...prev, [pid]: info }));

      setLines((prev) => prev.map((l) => {
        if (l.productId !== pid) return l;
        const normalizedVariation: Record<string, string> = {};
        for (const [k, v] of Object.entries(l.variation)) {
          const matchedOpt = opts.find((opt: { name: string; values: string[] }) => opt.name.toLowerCase().trim() === k.toLowerCase().trim());
          if (matchedOpt) {
            normalizedVariation[matchedOpt.name] = v;
          } else {
            normalizedVariation[k] = v;
          }
        }
        return { ...l, image: info.image ?? l.image, variation: normalizedVariation };
      }));

      return info;
    } catch {
      return null;
    }
  }

  const lineSubtotal = useMemo(() => lines.reduce((s, l) => s + l.qty * l.unitPrice, 0), [lines]);
  const subtotal = lineSubtotal;
  const total = subtotal + shipping;


  useEffect(() => {
    if (!open) return;
    // Load products list once — posOnly products (sold only at the till,
    // see Product.posOnly) are excluded: online orders can't contain them
    // anyway (checkout/order-update both reject them server-side), so they
    // shouldn't be offered here to begin with.
    if (!products.length) {
      fetch(`${apiBase}/products-picker?excludePosOnly=true`).then(async (r) => {
        if (r.ok) setProducts(await r.json());
      }).catch(() => {});
    }
    // Load available order-status slugs
    if (!statusList.length) {
      setStatusList(['confirme', 'en-attente', 'tentative', 'annule']);
    }
    if (orderId) {
      setLoading(true);
      setProductInfo({});
      fetch(`${apiBase}/orders/${orderId}`)
        .then((r) => {
          if (r.status === 401) {
            window.location.href = adminLoginHref(`from=${encodeURIComponent(window.location.pathname + window.location.search)}`);
            throw new Error('Session expirée');
          }
          if (!r.ok) throw new Error('Erreur de chargement');
          return r.json();
        })
        .then((o: OrderResponse) => {
          setStatus(o.status);
          setOriginalStatus(String(o.status));
          setAttempts(Number(o.meta?._mzem_attempts ?? 1));
          setNavexTracking(String((o.meta?._navex_tracking as string) ?? ''));
          setNavexStatus(((o.meta?._navex_status as 'sent' | 'failed') ?? 'idle'));
          setNavexMsg(String((o.meta?._navex_error as string) ?? ''));
          setFdTracking(String((o.meta?._fd_tracking as string) ?? ''));
          setFdStatus(((o.meta?._fd_status as 'sent' | 'failed') ?? 'idle'));
          setFdMsg(String((o.meta?._fd_error as string) ?? ''));
          setAxessTracking(String((o.meta?._axess_tracking as string) ?? ''));
          setAxessStatus(((o.meta?._axess_status as 'sent' | 'failed') ?? 'idle'));
          setAxessMsg(String((o.meta?._axess_error as string) ?? ''));

          setDeliveryCompany(String((o.meta?._mzem_delivery_company as string) ?? ''));
          setExchange(o.meta?._mzem_exchange === 'yes');
          setShipping(o.shipping ?? 8);
          setPrivateNote(String((o.meta?._mzem_private_note as string) ?? ''));
          setCustomer({
            firstName: o.customer?.firstName ?? '',
            phone: o.customer?.phone ?? '',
            city: o.customer?.city ?? '',
            address: o.customer?.address ?? '',
            phone2: String((o.meta?._mzem_phone_2 as string) ?? ''),
            email: o.customer?.email ?? '',
            note: '',
          });
          setLines(o.items.map((i) => parseLine(i)));
          // Lazy-load product info (options + bundles) for each product in the order
          const uniqueIds = Array.from(new Set(o.items.map((i) => i.productId)));
          uniqueIds.forEach((pid) => { void ensureProductInfo(pid); });
        })
        .catch(() => alert('Erreur de chargement de la commande'))
        .finally(() => setLoading(false));
    } else {
      // reset on open-for-create — leave status blank so we DON'T send it,
      // letting WooCommerce apply the site's default (works on custom-status plugins).
      setStatus('');
      setOriginalStatus('');
      setAttempts(1);
      setNavexTracking('');
      setNavexStatus('idle');
      setNavexMsg('');
      setFdTracking('');
      setFdStatus('idle');
      setFdMsg('');
      setAxessTracking('');
      setAxessStatus('idle');
      setAxessMsg('');
      setDeliveryCompany('');
      setExchange(false);
      setShipping(8);
      setPrivateNote('');
      setCustomer({ firstName: '', phone: '', city: '', address: '', phone2: '', email: '', note: '' });
      setLines([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId]);

  // Close picker on click outside
  useEffect(() => {
    if (!pickerOpen) return;
    function onPointer(e: PointerEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [pickerOpen]);

  const filteredProducts = useMemo(() => {
    const q = pickerQuery.toLowerCase().trim();
    if (!q) return products.slice(0, 30);
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 30);
  }, [products, pickerQuery]);

  async function addProduct(p: ProductPickerItem) {
    setPickerOpen(false);
    setPickerQuery('');
    // Load the product's full info first so we know whether it has bundles
    const info = await ensureProductInfo(p.id);
    const defaultBundle = info?.bundles.find((b) => b.quantity > 0);
    if (defaultBundle && defaultBundle.quantity > 1) {
      // Add one slot row per bundle item — user can switch to another bundle via the dropdown.
      const perSlotPrice = defaultBundle.price / Math.max(1, defaultBundle.quantity);
      const slots: LineDraft[] = Array.from({ length: defaultBundle.quantity }, (_, k) => ({
        productId: p.id,
        name: p.name,
        image: p.image,
        qty: 1,
        unitPrice: perSlotPrice,
        variation: {},
        bundleName: defaultBundle.name,
        slotIndex: k + 1,
      }));
      setLines((prev) => [...prev, ...slots]);
    } else if (defaultBundle && defaultBundle.quantity === 1) {
      // Single-item bundle: still tag the line so it shows the bundle dropdown header.
      setLines((prev) => [...prev, {
        productId: p.id, name: p.name, image: p.image, qty: 1, unitPrice: defaultBundle.price,
        variation: {}, bundleName: defaultBundle.name, slotIndex: 1,
      }]);
    } else {
      setLines((prev) => [...prev, {
        productId: p.id, name: p.name, image: p.image, qty: 1, unitPrice: p.price, variation: {},
      }]);
    }
  }
  function setLine(idx: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function setLineVariation(idx: number, attrName: string, value: string) {
    setLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      const cleanVariation: Record<string, string> = {};
      const targetKey = attrName.toLowerCase().trim();
      for (const [k, v] of Object.entries(l.variation)) {
        if (k.toLowerCase().trim() !== targetKey) {
          cleanVariation[k] = v;
        }
      }
      cleanVariation[attrName] = value;
      return { ...l, variation: cleanVariation };
    }));
  }
  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }
  function removeBundleGroup(productId: string, bundleName: string) {
    setLines((prev) => prev.filter((l) => !(l.productId === productId && l.bundleName === bundleName)));
  }
  function switchBundle(productId: string, oldBundleName: string, newBundle: { name: string; quantity: number; price: number }) {
    const info = productInfo[productId];
    setLines((prev) => {
      const groupLines = prev.filter((l) => l.productId === productId && l.bundleName === oldBundleName);
      const others = prev.filter((l) => !(l.productId === productId && l.bundleName === oldBundleName));
      const first = groupLines[0];
      if (!first) return prev;
      const newSlots = Array.from({ length: newBundle.quantity }, (_, k) => ({
        productId,
        name: first.name,
        image: first.image,
        qty: 1,
        unitPrice: newBundle.price / Math.max(1, newBundle.quantity),
        variation: groupLines[k]?.variation ?? {},
        bundleName: newBundle.name,
        slotIndex: k + 1,
      }));
      void info; // info present means dropdowns are populated
      return [...others, ...newSlots];
    });
  }

  async function save() {
    if (saveInFlightRef.current) return;
    if (!customer.firstName || !customer.phone) {
      alert('Nom et téléphone obligatoires.');
      return;
    }
    if (!lines.length) {
      alert('Ajoutez au moins un produit.');
      return;
    }
    if (isSensitiveOrder && !editReason.trim()) {
      alert('Cette commande est déjà confirmée — indiquez un motif de modification.');
      return;
    }
    saveInFlightRef.current = true;
    setSaving(true);
    try {
      const statusChanged = isEdit ? (status && status !== originalStatus) : Boolean(status);
      const payload: Record<string, unknown> = {
        customer,
        // Shape must exactly match backend UpdateOrderDto's OrderUpdateItemDto
        // — the global ValidationPipe rejects unknown fields (forbidNonWhitelisted).
        items: lines.map((l) => ({
          productId: l.productId,
          qty: l.qty,
          unitPrice: l.unitPrice,
          variation: l.variation,
          bundleName: l.bundleName,
          bundleSlot: l.slotIndex,
        })),
        shipping,
        // subtotal/total are deliberately NOT sent — the backend always
        // recomputes real totals from `items`+`shipping` server-side now;
        // sending a client total here would only set the separate manual-
        // override fields, which this form doesn't intend to do.
        deliveryCompany,
        exchange,
        privateNote,
      };
      if (statusChanged) payload.status = status;
      payload.attempts = attempts;
      if (editReason.trim()) payload.reason = editReason.trim();
      const url = isEdit ? `${apiBase}/orders/${orderId}` : `${apiBase}/orders`;
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.status === 401) {
        window.location.href = adminLoginHref(`from=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        throw new Error('Session expirée');
      }
      if (!res.ok) throw new Error((await res.json()).error ?? 'Erreur');
      const order = await res.json();

      // ── Auto-push to delivery company ────────────────────────────────────
      const savedId = String(order.id ?? orderId ?? '');
      const co = deliveryCompany.toLowerCase();
      if (savedId && co) {
        if (co.includes('navex') && navexStatus !== 'sent' && !navexTracking) {
          const r = await fetch(`${apiBase}/navex`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: savedId }),
          });
          const d = await r.json().catch(() => ({}));
          if (r.ok && d?.ok) {
            setNavexTracking(d.barcode ?? '');
            setNavexStatus('sent');
            setNavexMsg('');
          } else {
            setNavexStatus('failed');
            setNavexMsg(d?.error ?? `HTTP ${r.status}`);
          }
        } else if (co.includes('first') && fdStatus !== 'sent' && !fdTracking) {
          const r = await fetch(`${apiBase}/firstdelivery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: savedId }),
          });
          const d = await r.json().catch(() => ({}));
          if (r.ok && d?.ok) {
            setFdTracking(d.barcode ?? '');
            setFdStatus('sent');
            setFdMsg('');
          } else {
            setFdStatus('failed');
            setFdMsg(d?.error ?? `HTTP ${r.status}`);
          }
        } else if (co.includes('axess') && axessStatus !== 'sent' && !axessTracking) {
          const r = await fetch(`${apiBase}/axess`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: savedId }),
          });
          const d = await r.json().catch(() => ({}));
          if (r.ok && d?.ok) {
            setAxessTracking(d.barcode ?? '');
            setAxessStatus('sent');
            setAxessMsg('');
          } else {
            setAxessStatus('failed');
            setAxessMsg(d?.error ?? `HTTP ${r.status}`);
          }
        }
      }
      // ─────────────────────────────────────────────────────────────────────

      onSaved?.(order);
      onClose();
    } catch (e) {
      alert(`Échec: ${e instanceof Error ? e.message : 'inconnu'}`);
    } finally {
      setSaving(false);
      saveInFlightRef.current = false;
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? `Modifier la commande` : 'Créer une commande'}
      actions={
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white shadow-soft hover:bg-brand-600 disabled:opacity-50">
          <Save size={14} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
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
          <h3 className="text-base font-black text-ink-900">Chargement de la commande</h3>
          <p className="mt-1 text-xs text-ink-700">Récupération des informations de la boutique...</p>
        </div>
      ) : (
        <div className="space-y-5">
          {isSensitiveOrder && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="flex items-center gap-2 text-sm font-black text-amber-800">
                <AlertTriangle size={16} /> Commande déjà confirmée — le stock a été déduit
              </p>
              <p className="mt-1 text-xs text-amber-700">
                Modifier les articles, la livraison ou le statut ajustera le stock en conséquence et sera journalisé. Un motif est requis.
              </p>
              <label className="mt-3 block text-xs font-bold text-amber-800">Motif de la modification
                <input className="input mt-1" value={editReason} onChange={(e) => setEditReason(e.target.value)} placeholder="Ex. Client a demandé une taille différente" />
              </label>
            </div>
          )}

          {/* Détails de la commande */}
          <Card title="Détails de la commande" right={
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={exchange} onChange={(e) => setExchange(e.target.checked)} className="h-4 w-4 accent-brand-500" />
              Échange
            </label>
          }>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Statut">
                <select className="input" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)}>
                  <option value="">— Par défaut —</option>
                  {statusList.map((s) => (
                    <option key={s} value={s}>
                      {s === 'tentative' ? `Tentative ${attempts}` : labelFor(s)}
                    </option>
                  ))}
                </select>
              </Field>

              {status === 'tentative' && (
                <Field label="Attempt">
                  <div className="flex items-center gap-1 mt-1">
                    <button
                      type="button"
                      onClick={() => setAttempts((v) => Math.max(1, v - 1))}
                      className="grid h-12 w-12 place-items-center rounded-xl border border-ink-200 bg-white text-ink-900 font-bold hover:bg-ink-100 transition active:scale-95"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      value={attempts}
                      onChange={(e) => setAttempts(Math.max(1, Number(e.target.value) || 1))}
                      className="h-12 w-28 rounded-xl border border-ink-200 bg-white px-4 text-center font-black outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50 text-ink-900"
                    />
                    <button
                      type="button"
                      onClick={() => setAttempts((v) => v + 1)}
                      className="grid h-12 w-12 place-items-center rounded-xl border border-ink-200 bg-white text-ink-900 font-bold hover:bg-ink-100 transition active:scale-95"
                    >
                      +
                    </button>
                  </div>
                </Field>
              )}
            </div>
            <Field label="Société de livraison" className="mt-4">
              <select className="input" value={deliveryCompany} onChange={(e) => setDeliveryCompany(e.target.value)}>
                <option value="">-</option>
                <option value="Navex">Navex</option>
                <option value="First Delivery">First Delivery</option>
                <option value="Axess Logistique">Axess Logistique</option>
              </select>
            </Field>
            <Field label="Ajouter une note privée…" className="mt-4">
              <textarea rows={3} className="input" value={privateNote} onChange={(e) => setPrivateNote(e.target.value)} placeholder="Ajouter une note privée…" />
            </Field>
          </Card>

          {/* Détails du client */}
          {isEdit && (
            <div className="space-y-2">
              {/* Navex panel */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  {navexTracking && (
                    <>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                        <Check size={12} /> Envoyé à Navex
                      </span>
                      <span className="text-xs text-ink-700">
                        Code à barre : <code className="rounded bg-ink-100 px-2 py-0.5 font-mono">{navexTracking}</code>
                      </span>
                    </>
                  )}
                  {!navexTracking && navexStatus === 'failed' && (
                    <>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700">
                        <AlertTriangle size={12} /> Échec d&apos;envoi Navex
                      </span>
                      <span className="text-xs text-red-700">{navexMsg || 'Erreur inconnue'}</span>
                    </>
                  )}
                  {!navexTracking && navexStatus !== 'failed' && (
                    <span className="text-xs text-ink-700">Pas encore envoyé à Navex.</span>
                  )}
                </div>
              </div>
              {/* Axess Logistique panel */}
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm">
                {axessTracking && (
                  <>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                      <Check size={12} /> Envoyé à Axess
                    </span>
                    <span className="text-xs text-ink-700">
                      N° suivi : <code className="rounded bg-ink-100 px-2 py-0.5 font-mono">{axessTracking}</code>
                    </span>
                  </>
                )}
                {!axessTracking && axessStatus === 'failed' && (
                  <>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700">
                      <AlertTriangle size={12} /> Échec d&apos;envoi Axess
                    </span>
                    <span className="text-xs text-red-700">{axessMsg || 'Erreur inconnue'}</span>
                  </>
                )}
                {!axessTracking && axessStatus !== 'failed' && (
                  <span className="text-xs text-ink-700">Pas encore envoyé à Axess Logistique.</span>
                )}
              </div>
              {/* First Delivery panel */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  {fdTracking && (
                    <>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                        <Check size={12} /> Envoyé à First Delivery
                      </span>
                      <span className="text-xs text-ink-700">
                        Code à barre : <code className="rounded bg-ink-100 px-2 py-0.5 font-mono">{fdTracking}</code>
                      </span>
                    </>
                  )}
                  {!fdTracking && fdStatus === 'failed' && (
                    <>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700">
                        <AlertTriangle size={12} /> Échec d&apos;envoi First Delivery
                      </span>
                      <span className="text-xs text-red-700">{fdMsg || 'Erreur inconnue'}</span>
                    </>
                  )}
                  {!fdTracking && fdStatus !== 'failed' && (
                    <span className="text-xs text-ink-700">Pas encore envoyé à First Delivery.</span>
                  )}
                </div>
              </div>
            </div>
          )}

          <Card title="Détails du client">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nom"><input className="input" value={customer.firstName} onChange={(e) => setCustomer({ ...customer, firstName: e.target.value })} placeholder="Entrez votre nom" /></Field>
              <Field label="Téléphone"><input className="input" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} placeholder="Entrez votre numéro de téléphone" /></Field>
              <Field label="Ville">
                <select className="input" value={customer.city} onChange={(e) => setCustomer({ ...customer, city: e.target.value })}>
                  <option value="">Sélectionner Ville</option>
                  {SITE.cities.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Adresse"><input className="input" value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} placeholder="Entrez votre adresse" /></Field>
              <Field label="Téléphone 2"><input className="input" value={customer.phone2} onChange={(e) => setCustomer({ ...customer, phone2: e.target.value })} placeholder="Entrez votre second numéro de téléphone" /></Field>
              <Field label="Email"><input type="email" className="input" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} placeholder="Entrez votre email" /></Field>
            </div>
            <Field label="Note" className="mt-4">
              <textarea rows={3} className="input" value={customer.note} onChange={(e) => setCustomer({ ...customer, note: e.target.value })} placeholder="Entrez les notes supplémentaires" />
            </Field>
          </Card>

          {/* Sélectionner un produit */}
          <Card title="Sélectionner un produit">
            <div className="relative" ref={pickerRef}>
              <input
                className="input"
                placeholder="Produits"
                value={pickerQuery}
                onChange={(e) => { setPickerQuery(e.target.value); setPickerOpen(true); }}
                onFocus={() => setPickerOpen(true)}
              />
              {pickerOpen && (
                <div className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-ink-200 bg-white shadow-card">
                  {filteredProducts.length === 0 && <p className="p-4 text-sm text-ink-700">Aucun produit.</p>}
                  {filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addProduct(p)}
                      className="flex w-full items-center gap-3 border-b border-ink-200 px-3 py-2 text-left last:border-0 hover:bg-ink-100"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {p.image ? <img src={p.image} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <div className="h-10 w-10 rounded-lg bg-ink-200" />}
                      <span className="flex-1 text-sm font-bold">{p.name}</span>
                      <span className="text-sm font-black text-brand-500">{formatPrice(p.price)}</span>
                      <Plus size={16} className="text-brand-500" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Résumé des commandes */}
          <Card title="Résumé des commandes">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-separate border-spacing-0 text-sm min-w-[860px]">
                <colgroup>
                  <col className="w-[220px]" />
                  <col className="w-[70px]" />
                  <col className="w-[90px]" />
                  <col />
                  <col className="w-[110px]" />
                  <col className="w-[90px]" />
                  <col className="w-[60px]" />
                </colgroup>
                <thead className="text-[10px] uppercase tracking-wider text-ink-700">
                  <tr className="bg-ink-100">
                    <th className="rounded-l-xl px-4 py-3 text-left font-bold">Produit</th>
                    <th className="px-3 py-3 text-left font-bold">ID</th>
                    <th className="px-3 py-3 text-left font-bold">Qté</th>
                    <th className="px-3 py-3 text-left font-bold">Attributs</th>
                    <th className="px-3 py-3 text-right font-bold">Prix unitaire</th>
                    <th className="px-3 py-3 text-right font-bold">Total</th>
                    <th className="rounded-r-xl px-3 py-3 text-right font-bold"></th>
                  </tr>
                </thead>
                <tbody>
                  {renderSummaryRows({
                    lines,
                    productInfo,
                    setLine,
                    setLineVariation,
                    removeLine,
                    removeBundleGroup,
                    switchBundle,
                  })}
                  {lines.length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-12 text-center text-ink-700">La scène est prête pour vos produits ! ✨🎉</td></tr>
                  )}
                </tbody>
                {lines.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={4} />
                      <td colSpan={2} className="px-3 pt-4">
                        <div className="space-y-1 rounded-xl bg-ink-100 px-4 py-3">
                          <div className="flex items-center justify-between gap-2 text-sm text-ink-700">
                            <span className="text-xs font-bold uppercase tracking-wider">Sous-total</span>
                            <span className="text-sm font-bold">{formatPrice(subtotal)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-sm text-ink-700">
                            <span className="text-xs font-bold uppercase tracking-wider">Livraison</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={shipping}
                                onChange={(e) => setShipping(Math.max(0, parseFloat(e.target.value) || 0))}
                                className="h-7 w-20 rounded bg-white px-2 py-0.5 text-right text-xs font-bold text-ink-900 border border-ink-200 outline-none focus:border-brand-500"
                              />
                              <span className="text-xs font-bold text-ink-700">DT</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2 border-t border-ink-200 pt-2">
                            <span className="text-xs font-black uppercase tracking-wider text-ink-900">Total</span>
                            <span className="text-lg font-black text-brand-500">{formatPrice(total)}</span>
                          </div>
                        </div>
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>
        </div>
      )}
    </Drawer>
  );
}

/** Group consecutive lines by (productId + bundleName) and render either a bundle group or a solo row. */
function renderSummaryRows(args: {
  lines: LineDraft[];
  productInfo: Record<string, ProductInfo>;
  setLine: (idx: number, patch: Partial<LineDraft>) => void;
  setLineVariation: (idx: number, attrName: string, value: string) => void;
  removeLine: (idx: number) => void;
  removeBundleGroup: (productId: string, bundleName: string) => void;
  switchBundle: (productId: string, oldBundleName: string, b: { name: string; quantity: number; price: number }) => void;
}): React.ReactNode {
  const { lines, productInfo, setLine, setLineVariation, removeLine, removeBundleGroup, switchBundle } = args;

  // Build groups while preserving original indices for setLine/removeLine.
  type Indexed = LineDraft & { _i: number };
  const indexed: Indexed[] = lines.map((l, i) => ({ ...l, _i: i }));
  const groups: { key: string; productId: string; bundleName?: string; items: Indexed[] }[] = [];
  for (const l of indexed) {
    const key = `${l.productId}|${l.bundleName ?? ''}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key && l.bundleName) {
      last.items.push(l);
    } else {
      groups.push({ key, productId: l.productId, bundleName: l.bundleName, items: [l] });
    }
  }

  const rows: React.ReactNode[] = [];
  for (const g of groups) {
    const info = productInfo[g.productId];
    const attrs = info?.options ?? [];
    const bundles = info?.bundles ?? [];

    if (g.bundleName) {
      // Bundle group header row
      rows.push(
        <tr key={`${g.key}-h`} className="bg-brand-50/50">
          <td className="rounded-l-xl px-4 py-3 align-middle" colSpan={6}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-brand-700">
                Bundle
              </span>
              <select
                value={g.bundleName ?? ''}
                onChange={(e) => {
                  const next = bundles.find((b) => b.name === e.target.value);
                  if (next) switchBundle(g.productId, g.bundleName!, next);
                }}
                className="min-h-[36px] flex-1 max-w-xs rounded-xl border border-ink-200 bg-white px-3 text-sm font-bold text-ink-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-50 outline-none"
              >
                <option value={g.bundleName}>{g.bundleName}</option>
                {bundles.filter((b) => b.name !== g.bundleName).map((b) => (
                  <option key={b.id} value={b.name}>{b.name}</option>
                ))}
              </select>
              <span className="text-xs text-ink-700">{g.items.length} article{g.items.length > 1 ? 's' : ''}</span>
            </div>
          </td>
          <td className="rounded-r-xl px-3 py-3 text-right">
            <button
              type="button"
              onClick={() => removeBundleGroup(g.productId, g.bundleName!)}
              className="rounded-lg p-2 text-red-500 hover:bg-red-50"
              title="Supprimer le bundle"
            >
              <Trash2 size={16} />
            </button>
          </td>
        </tr>,
      );

      g.items.forEach((l, k) => {
        const isFirst = k === 0;
        const isLast = k === g.items.length - 1;
        rows.push(
          <tr key={`${g.key}-${l._i}`} className={isLast ? 'border-b-2 border-brand-100/40' : ''}>
            <td className={`px-4 py-3 align-middle ${isFirst ? '' : 'pt-0'}`}>
              {isFirst ? (
                <div className="flex items-center gap-3">
                  {l.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={l.image} alt="" className="h-11 w-11 flex-none rounded-xl object-cover ring-1 ring-ink-200" />
                  ) : (
                    <div className="h-11 w-11 flex-none rounded-xl bg-ink-100" />
                  )}
                  <span className="line-clamp-2 break-words font-bold text-ink-900" title={l.name}>{l.name}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 pl-14 text-xs text-ink-700">
                  <span className="inline-flex h-5 min-w-[42px] items-center justify-center rounded-full bg-brand-100 px-2 text-[10px] font-black text-brand-700">
                    Item {k + 1}
                  </span>
                </div>
              )}
            </td>
            <td className="px-3 py-3 align-middle text-xs font-bold text-ink-700">{l.productId}</td>
            <td className="px-3 py-3 align-middle">
              <NumberField
                value={l.qty}
                onChange={(v) => setLine(l._i, { qty: Math.max(1, v) })}
                min={1}
                blankOnZero={false}
                live
                className="h-9 w-16 rounded-lg border border-ink-200 bg-white px-2 text-center text-sm font-bold outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
              />
            </td>
            <td className="px-3 py-3 align-middle">
              <VariationSelects
                attrs={attrs}
                value={l.variation}
                onChange={(name, v) => setLineVariation(l._i, name, v)}
              />
            </td>
            <td className="px-3 py-3 align-middle text-right">
              <NumberField
                value={l.unitPrice}
                onChange={(v) => setLine(l._i, { unitPrice: v })}
                step={0.01}
                decimals={2}
                live
                className="h-9 w-24 rounded-lg border border-ink-200 bg-white px-2 text-right text-sm font-bold outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
              />
            </td>
            <td className="px-3 py-3 align-middle text-right text-sm font-black text-ink-900 whitespace-nowrap">{formatPrice(l.qty * l.unitPrice)}</td>
            <td className="px-3 py-3 align-middle text-right">
              {!isFirst && (
                <button
                  type="button"
                  onClick={() => removeLine(l._i)}
                  className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                  title="Retirer cet item"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </td>
          </tr>,
        );
      });
    } else {
      // Solo line
      const l = g.items[0];
      rows.push(
        <tr key={`${g.key}-${l._i}`} className="border-t border-ink-200">
          <td className="px-4 py-3 align-middle">
            <div className="flex items-center gap-3">
              {l.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={l.image} alt="" className="h-11 w-11 flex-none rounded-xl object-cover ring-1 ring-ink-200" />
              ) : (
                <div className="h-11 w-11 flex-none rounded-xl bg-ink-100" />
              )}
              <span className="line-clamp-2 break-words font-bold text-ink-900" title={l.name}>{l.name}</span>
            </div>
          </td>
          <td className="px-3 py-3 align-middle text-xs font-bold text-ink-700">{l.productId}</td>
          <td className="px-3 py-3 align-middle">
            <NumberField
              value={l.qty}
              onChange={(v) => setLine(l._i, { qty: Math.max(1, v) })}
              min={1}
              blankOnZero={false}
              live
              className="h-9 w-16 rounded-lg border border-ink-200 bg-white px-2 text-center text-sm font-bold outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
            />
          </td>
          <td className="px-3 py-3 align-middle">
            <VariationSelects
              attrs={attrs}
              value={l.variation}
              onChange={(name, v) => setLineVariation(l._i, name, v)}
            />
          </td>
          <td className="px-3 py-3 align-middle text-right">
            <NumberField
              value={l.unitPrice}
              onChange={(v) => setLine(l._i, { unitPrice: v })}
              step={0.01}
              decimals={2}
              live
              className="h-9 w-24 rounded-lg border border-ink-200 bg-white px-2 text-right text-sm font-bold outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
            />
          </td>
          <td className="px-3 py-3 align-middle text-right text-sm font-black text-ink-900 whitespace-nowrap">{formatPrice(l.qty * l.unitPrice)}</td>
          <td className="px-3 py-3 align-middle text-right">
            <button
              type="button"
              onClick={() => removeLine(l._i)}
              className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
              title="Retirer"
            >
              <Trash2 size={14} />
            </button>
          </td>
        </tr>,
      );
    }
  }
  return rows;
}

/** One <select> per known product attribute, free-form fallback when no options were configured. */
function VariationSelects({
  attrs, value, onChange,
}: {
  attrs: { name: string; values: string[] }[];
  value: Record<string, string>;
  onChange: (name: string, v: string) => void;
}) {
  // If we don't have option metadata yet, just show whatever the order has as chips.
  if (!attrs.length) {
    const entries = Object.entries(value).filter(([, v]) => v);
    if (!entries.length) return <span className="text-ink-700">—</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {entries.map(([k, v]) => (
          <span key={k} className="rounded-md bg-ink-100 px-2 py-0.5 text-[11px] font-bold text-ink-700">
            <span className="opacity-70">{k}:</span> {v}
          </span>
        ))}
      </div>
    );
  }

  // Find helper to get value case-insensitively
  const getValueCaseInsensitive = (key: string): string => {
    const target = key.toLowerCase().trim();
    for (const [k, v] of Object.entries(value)) {
      if (k.toLowerCase().trim() === target) return v;
    }
    return '';
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {attrs.map((a) => {
        const val = getValueCaseInsensitive(a.name);
        const filled = !!val;
        return (
          <label key={a.name} className="relative">
            <span className="pointer-events-none absolute left-2 top-0.5 text-[9px] font-bold uppercase tracking-wider text-ink-700">
              {a.name}
            </span>
            <select
              value={val}
              onChange={(e) => onChange(a.name, e.target.value)}
              className={`h-10 w-[110px] min-w-0 rounded-lg border bg-white pl-2 pr-6 pt-3 pb-0 text-xs font-bold outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-50 ${
                filled ? 'border-brand-300 text-brand-700' : 'border-ink-200 text-ink-700'
              }`}
            >
              <option value="">—</option>
              {a.values.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
        );
      })}
    </div>
  );
}

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-ink-200 bg-white">
      <header className="flex items-center justify-between border-b border-ink-200 px-5 py-3">
        <h3 className="text-sm font-black uppercase tracking-wide text-ink-900">{title}</h3>
        {right}
      </header>
      <div className="p-5">{children}</div>
    </section>
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
