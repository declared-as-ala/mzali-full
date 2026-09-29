import type { Product, ProductBundle } from '@/types';

/**
 * Pure logic behind the admin product editor. Kept free of React so the rules
 * that protect product data (what is sent on save, which response may be
 * applied) are unit-tested rather than trusted.
 */

export type EditorOption = { label: string; type: 'text' | 'select' | 'radio'; values: string[] };

export type EditorForm = {
  name: string;
  sku: string;
  categoryIds: string[];
  regularPrice: number;
  /** The selling price shown as "Prix". Equals `regularPrice` when there is no sale. */
  salePrice: number;
  purchasePrice: number;
  supplierId: string;
  description: string;
  status: 'published' | 'draft' | 'private';
  options: EditorOption[];
  bundles: ProductBundle[];
  upsellIds: string[];
  posOnly: boolean;
};

export const EMPTY_FORM: EditorForm = {
  name: '', sku: '', categoryIds: [], regularPrice: 0, salePrice: 0, purchasePrice: 0, supplierId: '',
  description: '', status: 'published', options: [], bundles: [], upsellIds: [], posOnly: false,
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Builds the editable form from the server's product. Always a deep copy: the
 *  form never shares a nested object with anything else. */
export function formFromProduct(p: Product): EditorForm {
  const rawOptions = p.meta?._mzem_options;
  const options: EditorOption[] = Array.isArray(rawOptions)
    ? rawOptions.map((o: { label: string; type?: EditorOption['type']; values: string[] | string }) => ({
        label: o.label,
        type: o.type ?? 'text',
        // exact values, never re-split or re-cased
        values: Array.isArray(o.values) ? [...o.values] : String(o.values ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      }))
    : [];
  const purchaseMinor = p.meta?.purchasePriceMinor;
  return clone({
    name: p.name,
    sku: p.sku ?? '',
    categoryIds: p.categoryIds ?? [],
    regularPrice: p.regularPrice,
    salePrice: p.salePrice ?? p.price,
    purchasePrice: typeof purchaseMinor === 'number' ? purchaseMinor / 1000 : 0,
    supplierId: p.supplierId ?? '',
    description: p.description ?? '',
    status: p.status,
    options,
    bundles: p.bundles ?? [],
    upsellIds: p.upsellIds ?? [],
    posOnly: p.posOnly ?? false,
  });
}

export const formSignature = (form: EditorForm): string => JSON.stringify(form);
export const isFormDirty = (base: EditorForm, form: EditorForm): boolean => formSignature(base) !== formSignature(form);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** "Prix" equal to (or blank against) the regular price means "not on sale". */
const salePriceOrNull = (form: EditorForm): number | null =>
  form.salePrice && form.salePrice !== form.regularPrice ? form.salePrice : null;

const optionsPayload = (options: EditorOption[]) => options.map((o) => ({ label: o.label, type: o.type, values: [...o.values] }));

/**
 * The PATCH body for an existing product: ONLY fields the admin actually
 * changed. Untouched fields are never sent, so a stale or partially loaded
 * form can't overwrite them, and editing Options can't touch Bundles (and
 * vice versa). Stock is never part of it.
 */
export function buildPatch(base: EditorForm, form: EditorForm): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (form.name !== base.name) patch.name = form.name;
  if (form.sku !== base.sku) patch.sku = form.sku;
  if (form.status !== base.status) patch.status = form.status;
  if (form.description !== base.description) patch.description = form.description;
  if (form.regularPrice !== base.regularPrice) patch.regularPrice = form.regularPrice;
  if (form.regularPrice !== base.regularPrice || form.salePrice !== base.salePrice) patch.salePrice = salePriceOrNull(form);
  if (form.purchasePrice !== base.purchasePrice) patch.purchasePrice = form.purchasePrice;
  if (form.supplierId !== base.supplierId) patch.supplierId = form.supplierId || null;
  if (!same(form.categoryIds, base.categoryIds)) patch.categoryIds = [...form.categoryIds];
  if (!same(form.upsellIds, base.upsellIds)) patch.upsellIds = [...form.upsellIds];
  if (!same(form.bundles, base.bundles)) patch.bundles = clone(form.bundles);
  if (!same(form.options, base.options)) patch.options = optionsPayload(form.options);
  if (form.posOnly !== base.posOnly) patch.posOnly = form.posOnly;
  return patch;
}

/** Full body for a brand-new product. */
export function buildCreatePayload(form: EditorForm): Record<string, unknown> {
  return {
    name: form.name,
    sku: form.sku || undefined,
    status: form.status,
    description: form.description,
    regularPrice: form.regularPrice,
    salePrice: salePriceOrNull(form),
    purchasePrice: form.purchasePrice,
    supplierId: form.supplierId || null,
    categoryIds: [...form.categoryIds],
    upsellIds: [...form.upsellIds],
    bundles: clone(form.bundles),
    options: optionsPayload(form.options),
    posOnly: form.posOnly,
  };
}

export type LatestRequest = { signal: AbortSignal; isCurrent: () => boolean };

/**
 * Only the most recently started request may apply its result. Starting a new
 * one (or cancelling) aborts the previous and makes its `isCurrent()` false, so
 * a slow response for product A can never land on the form of product B.
 */
export function createLatestGuard() {
  let seq = 0;
  let controller: AbortController | null = null;
  return {
    begin(): LatestRequest {
      controller?.abort();
      const mine = new AbortController();
      controller = mine;
      const id = ++seq;
      return { signal: mine.signal, isCurrent: () => id === seq && !mine.signal.aborted };
    },
    cancel(): void {
      seq += 1;
      controller?.abort();
      controller = null;
    },
  };
}
