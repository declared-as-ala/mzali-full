import { ConflictException, NotFoundException } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import mongoose, { Model } from 'mongoose';
import { Category, CategorySchema } from '@/catalog/category.schema';
import { ProductVariantsService } from '@/catalog/product-variants.service';
import { Product, ProductSchema } from '@/catalog/product.schema';
import { ProductsService } from '@/catalog/products.service';
import { Variant, VariantSchema } from '@/catalog/variant.schema';
import { OnlineAvailabilityService } from '@/inventory/online-availability.service';
import { MediaService } from '@/media/media.service';

/**
 * Cross-product safety. Editing ONE product must never change another.
 * Runs against a real MongoDB (default: the throwaway container on :27099;
 * override with MONGODB_TEST_URI) and skips itself when it is unreachable,
 * like the other integration specs.
 *
 * Regression for the production incident where product A's data (name, price,
 * options...) was written into products B..E after fast drawer switching.
 */
const URI = process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27099/mzali_product_isolation';

type Doc = Record<string, unknown> & { _id: unknown };

describe('Product update isolation (integration)', () => {
  let infra = true;
  let service: ProductsService;
  let products: Model<Product>;
  let variants: Model<Variant>;
  let ids: string[] = [];

  const mediaStub = {
    assertAndGetUrls: async () => new Map<string, string>(),
    getUrlsByIds: async () => new Map<string, string>(),
    markAttached: async () => undefined,
    markDetached: async () => undefined,
    deleteOrphaned: async () => false,
  };
  const availabilityStub = { enabled: async () => false, resolveMany: async () => new Map<string, number>() };

  const raw = async (): Promise<Doc[]> => (await products.collection.find({}).sort({ _id: 1 }).toArray()) as Doc[];
  const rawVariants = async (): Promise<Doc[]> => (await variants.collection.find({}).sort({ _id: 1 }).toArray()) as Doc[];
  const byId = (docs: Doc[], id: string) => docs.find((d) => String(d._id) === id)!;
  const others = (docs: Doc[], id: string) => docs.filter((d) => String(d._id) !== id);

  const bundle = (n: number) => ({ id: `bundle-${n}`, name: `Pack ${n}`, label: `L${n}`, regularPrice: 100 + n, price: 90 + n, deliveryPrice: n, quantity: 2, badgeColor: 'red' as const, isDefault: n % 2 === 0 });

  async function seed(count = 20) {
    await products.deleteMany({});
    await variants.deleteMany({});
    ids = [];
    for (let n = 0; n < count; n++) {
      const created = await service.create({
        name: `Product ${n} unique`,
        description: `Description number ${n}`,
        regularPrice: 30 + n,
        salePrice: n % 3 === 0 ? 20 + n : null,
        status: n % 4 === 0 ? 'private' : 'published',
        posOnly: n % 5 === 0,
        purchasePrice: 10 + n,
        options: [
          { label: 'couleur', type: 'text', values: [`c${n}a`, `c${n}b`, `blanc bl gris ${n}`] },
          { label: 'tallie', type: 'text', values: ['s', 'm', 'l'] },
        ],
        bundles: n % 2 === 0 ? [bundle(n)] : [],
        upsellIds: [],
        categoryIds: [],
      });
      ids.push(created.id);
    }
  }

  beforeAll(async () => {
    try {
      const moduleRef = await Test.createTestingModule({
        imports: [
          MongooseModule.forRoot(URI, { serverSelectionTimeoutMS: 3000 }),
          MongooseModule.forFeature([
            { name: Product.name, schema: ProductSchema },
            { name: Category.name, schema: CategorySchema },
            { name: Variant.name, schema: VariantSchema },
          ]),
        ],
        providers: [
          ProductsService,
          ProductVariantsService,
          { provide: MediaService, useValue: mediaStub },
          { provide: OnlineAvailabilityService, useValue: availabilityStub },
        ],
      }).compile();
      await moduleRef.init();
      service = moduleRef.get(ProductsService);
      products = moduleRef.get<Model<Product>>(getModelToken(Product.name));
      variants = moduleRef.get<Model<Variant>>(getModelToken(Variant.name));
    } catch {
      infra = false;
      console.warn(`[product-isolation] MongoDB unreachable at ${URI}; skipping.`);
    }
  }, 30000);

  afterAll(async () => {
    if (!infra) return;
    await products.deleteMany({});
    await variants.deleteMany({});
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    if (infra) await seed();
  }, 60000);

  const updates: [string, (id: string, n: number) => Parameters<ProductsService['update']>[1], (d: Doc) => void][] = [
    ['visibility', () => ({ status: 'private' }), (d) => expect(d.status).toBe('private')],
    ['price', () => ({ regularPrice: 35, salePrice: null }), (d) => expect(d.regularPriceMinor).toBe(35000)],
    ['name', () => ({ name: 'Renamed target' }), (d) => expect(d.name).toBe('Renamed target')],
    ['options', () => ({ options: [{ label: 'couleur', type: 'text', values: ['Blanc'] }, { label: 'tallie', type: 'text', values: ['M'] }] }), (d) => expect((d.options as { values: string[] }[])[0].values).toEqual(['Blanc'])],
    ['bundles', (_id, n) => ({ bundles: [bundle(900 + n)] }), (d) => expect((d.bundles as { id: string }[])[0].id).toMatch(/^bundle-9/)],
    ['image metadata', () => ({ media: [{ mediaId: 'https://cdn.example/b.jpg', position: 0, isPrimary: true }, { mediaId: 'https://cdn.example/a.jpg', position: 1, isPrimary: false }] }), (d) => expect((d.images as { url: string; isPrimary: boolean }[]).find((i) => i.isPrimary)?.url).toBe('https://cdn.example/b.jpg')],
  ];

  it.each(updates)('%s: updating ONE of 20 products leaves the other 19 byte-for-byte identical', async (label, makePatch, assertTarget) => {
    if (!infra) return;
    // Give the image case a legacy image to reorder so it exercises the same code path as production.
    for (let i = 0; i < ids.length; i++) {
      await products.collection.updateOne({ _id: new mongoose.Types.ObjectId(ids[i]) }, { $set: { images: [{ mediaId: null, url: 'https://cdn.example/a.jpg', alt: '', position: 0, isPrimary: true }, { mediaId: null, url: 'https://cdn.example/b.jpg', alt: '', position: 1, isPrimary: false }] } });
    }
    const updateManySpy = jest.spyOn(products, 'updateMany');
    const bulkWriteSpy = jest.spyOn(products, 'bulkWrite');
    // A different target for each update type, deterministic.
    const target = ids[(label.length * 7 + 3) % ids.length];
    const before = await raw();
    const variantsBefore = await rawVariants();

    await service.update(target, makePatch(target, ids.indexOf(target)));

    const after = await raw();
    expect(after).toHaveLength(20);
    expect(others(after, target)).toEqual(others(before, target)); // ZERO changes anywhere else
    expect(others(await rawVariants(), target)).toEqual(others(variantsBefore, target));
    assertTarget(byId(after, target));
    expect(byId(after, target).revision).toBe(1);
    expect(updateManySpy).not.toHaveBeenCalled();
    expect(bulkWriteSpy).not.toHaveBeenCalled();
    updateManySpy.mockRestore();
    bulkWriteSpy.mockRestore();
  }, 60000);

  it('sweeps every update type against every product: nothing else ever changes', async () => {
    if (!infra) return;
    for (const id of ids) {
      const before = await raw();
      await service.update(id, { status: 'private', regularPrice: 99, name: `Sweep ${id}`, options: [{ label: 'couleur', type: 'text', values: ['X'] }, { label: 'tallie', type: 'text', values: ['S'] }], bundles: [bundle(1)] });
      expect(others(await raw(), id)).toEqual(others(before, id));
    }
  }, 120000);

  it('PRIVATE scenario: A/B/C — only A changes, and only its visibility', async () => {
    if (!infra) return;
    await products.deleteMany({});
    await variants.deleteMany({});
    const mk = (name: string, price: number) => service.create({ name, regularPrice: price, status: 'published' });
    const [A, B, C] = [await mk('A', 30), await mk('B', 60), await mk('C', 90)];
    const before = await raw();
    await service.update(A.id, { status: 'private' });
    const after = await raw();
    expect(others(after, A.id)).toEqual(others(before, A.id));
    const a = byId(after, A.id);
    const a0 = byId(before, A.id);
    expect(a.status).toBe('private');
    const { status: _s, updatedAt: _u, revision: _r, __v: _v, ...aRest } = a;
    const { status: _s0, updatedAt: _u0, revision: _r0, __v: _v0, ...a0Rest } = a0;
    expect(aRest).toEqual(a0Rest); // nothing else on A changed either
    expect([byId(after, B.id).name, byId(after, B.id).regularPriceMinor, byId(after, B.id).status]).toEqual(['B', 60000, 'published']);
    expect([byId(after, C.id).name, byId(after, C.id).regularPriceMinor, byId(after, C.id).status]).toEqual(['C', 90000, 'published']);
  });

  it('a partial update touches only the fields sent (no default/undefined leakage)', async () => {
    if (!infra) return;
    const target = ids[2];
    const before = byId(await raw(), target);
    await service.update(target, { name: 'Only the name' });
    const after = byId(await raw(), target);
    const { name: _n, updatedAt: _u, revision: _r, __v: _v, ...a } = after;
    const { name: _n0, updatedAt: _u0, revision: _r0, __v: _v0, ...b } = before;
    expect(a).toEqual(b);
  });

  it('OPTIONS persist exactly (comma inside a value, exact labels) and survive reopen', async () => {
    if (!infra) return;
    const id = ids[1];
    await service.update(id, { options: [{ label: 'couleur', type: 'text', values: ['blanc bl gris', 'gris bl blanc', 'Noir, mat'] }, { label: 'tallie', type: 'text', values: ['S', 'M', 'L', 'XL', '2XL', '3XL'] }] });
    for (let reopen = 0; reopen < 3; reopen++) {
      const p = (await service.getByIdForEdit(id))!;
      const opts = p.meta._mzem_options as { label: string; values: string[] }[];
      expect(opts[0].values).toEqual(['blanc bl gris', 'gris bl blanc', 'Noir, mat']);
      expect(opts[1].values).toEqual(['S', 'M', 'L', 'XL', '2XL', '3XL']);
    }
  });

  it('REMOVING an option value persists; the rest and other products are untouched', async () => {
    if (!infra) return;
    const id = ids[3];
    await service.update(id, { options: [{ label: 'couleur', type: 'text', values: ['Noir', 'Blanc'] }, { label: 'taille', type: 'text', values: ['M', 'L', 'XL'] }] });
    const before = await raw();
    await service.update(id, { options: [{ label: 'couleur', type: 'text', values: ['Blanc'] }, { label: 'taille', type: 'text', values: ['M', 'L', 'XL'] }] });
    const p = (await service.getByIdForEdit(id))!;
    expect((p.meta._mzem_options as { values: string[] }[]).map((o) => o.values)).toEqual([['Blanc'], ['M', 'L', 'XL']]);
    expect(others(await raw(), id)).toEqual(others(before, id));
  });

  it('duplicate option values are removed on save', async () => {
    if (!infra) return;
    await service.update(ids[4], { options: [{ label: 'couleur', type: 'text', values: 'Noir, noir, Blanc,,Blanc' }] });
    const p = (await service.getByIdForEdit(ids[4]))!;
    expect((p.meta._mzem_options as { values: string[] }[])[0].values).toEqual(['Noir', 'Blanc']);
  });

  it('BUNDLES persist across reopen, and Options/Bundles/Images/Visibility edits never wipe each other', async () => {
    if (!infra) return;
    const id = ids[0]; // has a bundle
    const snap = async () => (await service.getByIdForEdit(id))!;
    const start = await snap();
    expect(start.bundles).toHaveLength(1);

    await service.update(id, { options: [{ label: 'couleur', type: 'text', values: ['Z'] }, { label: 'tallie', type: 'text', values: ['S'] }] });
    let now = await snap();
    expect(now.bundles).toEqual(start.bundles); // options edit kept bundles

    await service.update(id, { bundles: [bundle(7), bundle(8)] });
    now = await snap();
    expect((now.meta._mzem_options as { values: string[] }[])[0].values).toEqual(['Z']); // bundles edit kept options
    expect(now.bundles).toHaveLength(2);

    await service.update(id, { media: [{ mediaId: 'https://cdn.example/x.jpg', position: 0, isPrimary: true }] }).catch(() => undefined);
    await service.update(id, { status: 'private' });
    now = await snap();
    expect(now.bundles).toHaveLength(2);
    expect((now.meta._mzem_options as { values: string[] }[])[0].values).toEqual(['Z']);
    expect(now.regularPrice).toBe(start.regularPrice);
    expect(now.status).toBe('private');
  });

  it('stock fields in a payload are ignored: the editor can never overwrite inventory-owned stock', async () => {
    if (!infra) return;
    const id = ids[5];
    await products.collection.updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { stockQuantity: 42, manageStock: true } });
    await service.update(id, { name: 'X', stockQuantity: 0, manageStock: false } as never);
    const doc = byId(await raw(), id);
    expect(doc.stockQuantity).toBe(42);
    expect(doc.manageStock).toBe(true);
  });

  it('purchase price is written only to THIS product\'s variants', async () => {
    if (!infra) return;
    const before = await rawVariants();
    await service.update(ids[6], { purchasePrice: 77 });
    const after = await rawVariants();
    const mine = after.filter((v) => v.productId === ids[6]);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((v) => v.purchasePriceMinor === 77000)).toBe(true);
    expect(after.filter((v) => v.productId !== ids[6])).toEqual(before.filter((v) => v.productId !== ids[6]));
  });

  it('STALE edit is refused (409) and changes nothing; the fresh revision succeeds', async () => {
    if (!infra) return;
    const id = ids[7];
    const opened = (await service.getByIdForEdit(id))!.revision!; // admin 1 opens
    await service.update(id, { name: 'Edited by admin 2', expectedRevision: opened }); // admin 2 saves first
    const before = await raw();
    await expect(service.update(id, { name: 'Stale overwrite', expectedRevision: opened })).rejects.toBeInstanceOf(ConflictException);
    expect(await raw()).toEqual(before);
    const fresh = (await service.getByIdForEdit(id))!.revision!;
    await service.update(id, { name: 'Now fine', expectedRevision: fresh });
    expect(byId(await raw(), id).name).toBe('Now fine');
  });

  it('DOUBLE SUBMIT: two simultaneous saves of the same revision produce exactly one logical update', async () => {
    if (!infra) return;
    const id = ids[8];
    const rev = (await service.getByIdForEdit(id))!.revision!;
    const results = await Promise.allSettled([
      service.update(id, { name: 'Twice', expectedRevision: rev }),
      service.update(id, { name: 'Twice', expectedRevision: rev }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(byId(await raw(), id).revision).toBe(rev + 1);
  });

  it('updating a non-existent or malformed id changes nothing at all', async () => {
    if (!infra) return;
    const before = await raw();
    await expect(service.update(new mongoose.Types.ObjectId().toString(), { name: 'ghost' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update('not-an-id', { name: 'ghost' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update('', { name: 'ghost' })).rejects.toBeInstanceOf(NotFoundException);
    expect(await raw()).toEqual(before);
  });

  it('DUPLICATE is a deep copy: editing the copy never touches the original', async () => {
    if (!infra) return;
    const src = ids[0];
    const original = (await service.getByIdForEdit(src))!;
    const copy = await service.duplicate(src);
    expect(copy.id).not.toBe(src);
    expect(copy.name).toBe(`${original.name} (copie)`);
    expect(copy.status).toBe('draft');
    expect(copy.sku).toBeNull();
    expect(copy.bundles.map((b) => b.id)).not.toEqual(original.bundles.map((b) => b.id)); // regenerated
    expect((await service.getByIdForEdit(copy.id))!.meta._mzem_options).toEqual(original.meta._mzem_options); // copied, not shared

    const before = byId(await raw(), src);
    await service.update(copy.id, {
      name: 'Edited copy', regularPrice: 1, status: 'published',
      options: [{ label: 'couleur', type: 'text', values: ['ONLY COPY'] }],
      bundles: [bundle(55)],
    });
    expect(byId(await raw(), src)).toEqual(before);
    const stillOriginal = (await service.getByIdForEdit(src))!;
    expect((stillOriginal.meta._mzem_options as { values: string[] }[])[0].values).toEqual((original.meta._mzem_options as { values: string[] }[])[0].values);
    expect(stillOriginal.bundles.map((b) => b.id)).toEqual(original.bundles.map((b) => b.id));
  });

  it('LEGACY document shapes load and update safely (no options, no bundles, no revision, old images, no posOnly)', async () => {
    if (!infra) return;
    await products.deleteMany({});
    const _id = new mongoose.Types.ObjectId();
    const neighbour = new mongoose.Types.ObjectId();
    const legacy = (id: mongoose.Types.ObjectId, name: string) => ({
      _id: id, name, slug: name.toLowerCase().replace(/\s+/g, '-'), status: 'published', description: 'old',
      regularPriceMinor: 12000, categoryIds: [], categorySlugs: [], images: [{ url: 'https://old.example/img.jpg' }],
      createdAt: new Date('2025-01-01'), updatedAt: new Date('2025-01-01'),
    });
    await products.collection.insertMany([legacy(_id, 'Legacy One'), legacy(neighbour, 'Legacy Two')]);
    const one = (await service.getByIdForEdit(String(_id)))!;
    expect(one.meta._mzem_options).toEqual([]);
    expect(one.bundles).toEqual([]);
    expect(one.revision).toBe(0);
    expect(one.posOnly).toBe(false);
    const before = await raw();
    await service.update(String(_id), { status: 'private' });
    expect(others(await raw(), String(_id))).toEqual(others(before, String(_id)));
    expect(byId(await raw(), String(_id)).status).toBe('private');
  });
});
