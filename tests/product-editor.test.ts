import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCreatePayload, buildPatch, createLatestGuard, EMPTY_FORM, formFromProduct, isFormDirty, type EditorForm } from '../lib/product-editor';
import type { Product } from '../types';

function product(over: Partial<Product> & { options?: unknown[]; purchasePriceMinor?: number | null } = {}): Product {
  const { options = [{ label: 'couleur', type: 'text', values: ['blanc bl gris', 'gris bl blanc'] }, { label: 'tallie', type: 'text', values: ['s', 'm', 'l'] }], purchasePriceMinor = 12000, ...rest } = over;
  return {
    id: 'a'.repeat(24), slug: 'a', name: 'A', sku: 'SKU-A', revision: 3, status: 'published', description: 'desc A',
    shortDescription: '', price: 30, regularPrice: 30, salePrice: null, onSale: false, currency: 'TND', inStock: true, stockQuantity: 9,
    images: [], categoryIds: ['c1'], categorySlugs: ['c'], attributes: [],
    bundles: [{ id: 'b1', name: 'Pack 2', regularPrice: 60, price: 50, deliveryPrice: 0, quantity: 2, badgeColor: 'red', isDefault: true }],
    upsellIds: ['u1'], crossSellIds: [], supplierId: null, posOnly: false,
    meta: { _mzem_options: options, purchasePriceMinor, cost: 5, deliveryPrice: 7, deliveryCost: 2 },
    ...rest,
  } as Product;
}

test('loading reads the fields the API really provides (sku, purchase price) and never invents cost/delivery values', () => {
  const form = formFromProduct(product());
  assert.equal(form.sku, 'SKU-A');
  assert.equal(form.purchasePrice, 12);
  assert.equal('cost' in form, false);
  assert.equal('deliveryPrice' in form, false);
  assert.equal('stockQuantity' in form, false);
});

test('an unchanged form produces an EMPTY patch: nothing is sent, so nothing can be overwritten', () => {
  const base = formFromProduct(product());
  assert.deepEqual(buildPatch(base, formFromProduct(product())), {});
  assert.equal(isFormDirty(base, formFromProduct(product())), false);
});

test('changing visibility sends ONLY status (never name, price, options, bundles, stock, cost)', () => {
  const base = formFromProduct(product());
  const form: EditorForm = { ...formFromProduct(product()), status: 'private' };
  assert.deepEqual(buildPatch(base, form), { status: 'private' });
});

test('changing price sends only the price fields', () => {
  const base = formFromProduct(product());
  const form = { ...formFromProduct(product()), regularPrice: 35, salePrice: 35 };
  assert.deepEqual(buildPatch(base, form), { regularPrice: 35, salePrice: null });
});

test('a real sale price is sent as a sale; "Prix" equal to the regular price means no sale', () => {
  const base = formFromProduct(product());
  assert.deepEqual(buildPatch(base, { ...formFromProduct(product()), salePrice: 25 }), { salePrice: 25 });
  assert.deepEqual(buildPatch(base, { ...formFromProduct(product()), salePrice: 30 }), {});
});

test('editing Options never sends Bundles, and editing Bundles never sends Options', () => {
  const base = formFromProduct(product());
  const optionsOnly = formFromProduct(product());
  optionsOnly.options[0].values = ['gris bl blanc'];
  const p1 = buildPatch(base, optionsOnly);
  assert.deepEqual(Object.keys(p1), ['options']);

  const bundlesOnly = formFromProduct(product());
  bundlesOnly.bundles[0].price = 45;
  const p2 = buildPatch(base, bundlesOnly);
  assert.deepEqual(Object.keys(p2), ['bundles']);
});

test('option values are sent exactly as saved: array, no re-splitting, no re-casing, comma preserved', () => {
  const base = formFromProduct(product());
  const form = formFromProduct(product());
  form.options[0].values = ['blanc bl gris', 'gris bl blanc', 'Noir, mat'];
  const patch = buildPatch(base, form) as { options: { label: string; values: string[] }[] };
  assert.deepEqual(patch.options[0].values, ['blanc bl gris', 'gris bl blanc', 'Noir, mat']);
  assert.equal(patch.options[0].label, 'couleur');
});

test('removing an option value persists as removal, other option untouched', () => {
  const base = formFromProduct(product({ options: [{ label: 'couleur', type: 'text', values: ['Noir', 'Blanc'] }, { label: 'taille', type: 'text', values: ['M', 'L', 'XL'] }] }));
  const form = formFromProduct(product({ options: [{ label: 'couleur', type: 'text', values: ['Noir', 'Blanc'] }, { label: 'taille', type: 'text', values: ['M', 'L', 'XL'] }] }));
  form.options[0].values = form.options[0].values.filter((v) => v !== 'Noir');
  const patch = buildPatch(base, form) as { options: { label: string; values: string[] }[] };
  assert.deepEqual(patch.options.map((o) => o.values), [['Blanc'], ['M', 'L', 'XL']]);
});

test('legacy products (no options, string-valued options, no sku, no purchase price) load without throwing', () => {
  const none = formFromProduct(product({ options: [], sku: undefined, purchasePriceMinor: null }));
  assert.deepEqual(none.options, []);
  assert.equal(none.sku, '');
  assert.equal(none.purchasePrice, 0);
  const legacy = formFromProduct(product({ options: [{ label: 'couleur', values: 'Noir, Blanc' }] }));
  assert.deepEqual(legacy.options[0].values, ['Noir', 'Blanc']);
  const noMeta = formFromProduct({ ...product(), meta: {} } as Product);
  assert.deepEqual(noMeta.options, []);
});

test('the form never shares nested objects with another form (no cross-product aliasing)', () => {
  const a = formFromProduct(product());
  const b = formFromProduct(product());
  a.options[0].values.push('X');
  a.bundles[0].name = 'changed';
  a.categoryIds.push('c9');
  assert.deepEqual(b.options[0].values, ['blanc bl gris', 'gris bl blanc']);
  assert.equal(b.bundles[0].name, 'Pack 2');
  assert.deepEqual(b.categoryIds, ['c1']);
  a.options = []; // and EMPTY_FORM stays pristine
  assert.deepEqual(EMPTY_FORM.options, []);
});

test('create payload carries everything needed and no stock fields', () => {
  const body = buildCreatePayload({ ...EMPTY_FORM, name: 'N', regularPrice: 10, salePrice: 10 });
  assert.equal(body.name, 'N');
  assert.equal(body.salePrice, null);
  assert.equal('stockQuantity' in body, false);
  assert.equal('manageStock' in body, false);
});

test('RAPID SWITCH: a late response for product A can never apply after product B was requested', async () => {
  const guard = createLatestGuard();
  const applied: string[] = [];
  const load = (id: string, delayMs: number) => {
    const req = guard.begin();
    return new Promise<void>((resolve) => setTimeout(() => { if (req.isCurrent()) applied.push(id); resolve(); }, delayMs));
  };
  const a = load('A', 60); // slow
  const b = load('B', 5);  // opened right after, fast
  await Promise.all([a, b]);
  assert.deepEqual(applied, ['B']);
});

test('closing the drawer cancels the in-flight load (nothing applies after unmount)', async () => {
  const guard = createLatestGuard();
  const applied: string[] = [];
  const req = guard.begin();
  const done = new Promise<void>((resolve) => setTimeout(() => { if (req.isCurrent()) applied.push('A'); resolve(); }, 20));
  guard.cancel();
  await done;
  assert.deepEqual(applied, []);
  assert.equal(req.signal.aborted, true);
});

test('open A, close, open B, close, open A: each session is isolated and only its own response applies', async () => {
  const sessions: { id: string; guard: ReturnType<typeof createLatestGuard> }[] = [];
  const shown: Record<string, string[]> = { A: [], B: [] };
  const open = (id: 'A' | 'B', delay: number) => {
    const guard = createLatestGuard();
    sessions.push({ id, guard });
    const req = guard.begin();
    return { promise: new Promise<void>((r) => setTimeout(() => { if (req.isCurrent()) shown[id].push(`data-${id}`); r(); }, delay)), close: () => guard.cancel() };
  };
  const a1 = open('A', 40); a1.close();
  const b1 = open('B', 5); await b1.promise; b1.close();
  const a2 = open('A', 5); await a2.promise;
  await a1.promise;
  assert.deepEqual(shown, { A: ['data-A'], B: ['data-B'] });
});
