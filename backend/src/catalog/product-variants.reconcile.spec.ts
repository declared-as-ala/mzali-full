import { ProductVariantsService } from './product-variants.service';

type V = { id: string; productId: string; sku: string; attributes: Record<string, string>; active: boolean; retired: boolean; boutiquePool?: boolean; obsoleteByOptions?: boolean; inventoryRevision: number };

/** Minimal in-memory stand-ins for the two Mongoose models this service uses. */
function setup(options: { label: string; values: string[] }[], variants: Partial<V>[], inventoryModel: 'MATRIX' | 'LEGACY' = 'MATRIX') {
  const product = { id: 'p1', deletedAt: null, inventoryModel, options };
  const rows: V[] = variants.map((v, i) => ({ id: `v${i}`, productId: 'p1', sku: `sku${i}`, attributes: {}, active: true, retired: false, inventoryRevision: 0, ...v }));
  const products = { findById: async () => product };
  const model = {
    find: async (f: { productId: string }) => rows.filter((r) => r.productId === f.productId && !r.retired && !r.boutiquePool),
    updateMany: async (f: { _id: { $in: string[] } }, u: { $set: Partial<V>; $inc?: { inventoryRevision: number } }) => {
      for (const r of rows.filter((x) => f._id.$in.includes(x.id))) {
        Object.assign(r, u.$set);
        r.inventoryRevision += u.$inc?.inventoryRevision ?? 0;
      }
    },
  };
  return { svc: new ProductVariantsService(products as never, model as never), rows, product };
}
const grid = (sizes: string[], colors: string[], extra: Partial<V> = {}): Partial<V>[] => sizes.flatMap((size) => colors.map((color) => ({ attributes: { size, color }, ...extra })));
const opts = (sizes: string[], colors: string[]) => [{ label: 'tallie', values: sizes }, { label: 'couleur', values: colors }];
const activeColors = (rows: V[]) => [...new Set(rows.filter((r) => r.active && !r.retired).map((r) => r.attributes.color))];

describe('ProductVariantsService.reconcileWithOptions', () => {
  it('removing color B hides it from the storefront: A and C remain', async () => {
    const { svc, rows, product } = setup(opts(['s', 'm'], ['A', 'B', 'C']), grid(['s', 'm'], ['A', 'B', 'C']));
    expect(activeColors(rows)).toEqual(['A', 'B', 'C']);
    product.options = opts(['s', 'm'], ['A', 'C']);
    const r = await svc.reconcileWithOptions('p1');
    expect(r.deactivated).toHaveLength(2);
    expect(activeColors(rows)).toEqual(['A', 'C']);
  });

  it('the real case: blanc gris removed, blanc bl gris / gris bl blanc kept, labels untouched', async () => {
    const v = [...grid(['s', 'm'], ['blanc gris']), ...grid(['s', 'm'], ['blanc bl gris', 'gris bl blanc'])];
    const { svc, rows } = setup(opts(['s', 'm'], ['blanc bl gris', 'gris bl blanc']), v);
    await svc.reconcileWithOptions('p1');
    expect(activeColors(rows)).toEqual(['blanc bl gris', 'gris bl blanc']);
    expect(rows.filter((r) => !r.active).every((r) => r.attributes.color === 'blanc gris')).toBe(true);
  });

  it('never deletes or retires: the row and its id survive so orders and stock still resolve', async () => {
    const { svc, rows } = setup(opts(['s'], ['A']), grid(['s'], ['A', 'B']));
    const before = rows.map((r) => r.id);
    await svc.reconcileWithOptions('p1');
    expect(rows.map((r) => r.id)).toEqual(before);
    const b = rows.find((r) => r.attributes.color === 'B')!;
    expect(b).toMatchObject({ active: false, retired: false, obsoleteByOptions: true });
    expect(b.inventoryRevision).toBe(1);
  });

  it('is idempotent and only leaves valid combinations on sale', async () => {
    const { svc, rows } = setup(opts(['s', 'm'], ['A']), grid(['s', 'm'], ['A', 'B']));
    await svc.reconcileWithOptions('p1');
    const again = await svc.reconcileWithOptions('p1');
    expect(again).toEqual({ deactivated: [], reactivated: [] });
    expect(rows.filter((r) => r.active).map((r) => `${r.attributes.size}/${r.attributes.color}`)).toEqual(['s/A', 'm/A']);
  });

  it('re-adding a removed value reactivates only variants switched off by this rule', async () => {
    const { svc, rows, product } = setup(opts(['s'], ['A']), grid(['s'], ['A', 'B', 'C']));
    rows.find((r) => r.attributes.color === 'C')!.active = false; // admin turned C off by hand
    await svc.reconcileWithOptions('p1'); // B goes obsolete, C is left alone
    product.options = opts(['s'], ['A', 'B', 'C']);
    const r = await svc.reconcileWithOptions('p1');
    expect(r.reactivated.map((c) => c.color)).toEqual(['B']);
    expect(activeColors(rows)).toEqual(['A', 'B']);
  });

  it('a removed size hides that size everywhere', async () => {
    const { svc, rows } = setup(opts(['s'], ['A', 'B']), grid(['s', 'xl'], ['A', 'B']));
    await svc.reconcileWithOptions('p1');
    expect(rows.filter((r) => r.active).every((r) => r.attributes.size === 's')).toBe(true);
  });

  it('is case/space tolerant for existing rows, so no false deactivation', async () => {
    const { svc, rows } = setup(opts(['m'], ['noir']), grid(['M'], [' NOIR ']));
    const r = await svc.reconcileWithOptions('p1');
    expect(r.deactivated).toHaveLength(0);
    expect(rows[0].active).toBe(true);
  });

  it('dry-run reports but writes nothing', async () => {
    const { svc, rows } = setup(opts(['s'], ['A']), grid(['s'], ['A', 'B']));
    const r = await svc.reconcileWithOptions('p1', { dryRun: true });
    expect(r.deactivated).toHaveLength(1);
    expect(rows.every((x) => x.active)).toBe(true);
  });

  it('leaves the boutique pool, attribute-less variants and non-MATRIX products alone', async () => {
    const a = setup(opts(['s'], ['A']), [{ boutiquePool: true }, { attributes: {} }, ...grid(['s'], ['A'])]);
    expect((await a.svc.reconcileWithOptions('p1')).deactivated).toHaveLength(0);
    const b = setup(opts(['s'], ['A']), grid(['s'], ['Z']), 'LEGACY');
    expect((await b.svc.reconcileWithOptions('p1')).skipped).toBe('not a MATRIX product');
    expect(b.rows[0].active).toBe(true);
    const c = setup([{ label: 'couleur', values: ['A'] }], grid(['s'], ['Z']));
    expect((await c.svc.reconcileWithOptions('p1')).skipped).toBe('no size/color options');
  });
});
