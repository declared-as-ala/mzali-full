import { diffCustomer, diffItems, hasItemChanges, itemsEqual, lineFieldChanges, snapshotCustomer, snapshotItems } from './order-diff';

const baseLine = {
  productId: 'p1',
  qty: 1,
  unitPriceMinor: 19900,
  variation: { color: 'noir', size: 'xl' },
  bundleName: null,
  bundleSlot: null,
};

describe('order-diff', () => {
  describe('itemsEqual / variation semantics', () => {
    it('treats a color-only change as a change (the reason modal must fire)', () => {
      const a = snapshotItems([baseLine]);
      const b = snapshotItems([{ ...baseLine, variation: { color: 'gris', size: 'xl' } }]);
      expect(itemsEqual(a[0]!, b[0]!)).toBe(false);
      expect(hasItemChanges(diffItems(a, b))).toBe(true);
    });

    it('treats a size-only change as a change', () => {
      const a = snapshotItems([baseLine]);
      const b = snapshotItems([{ ...baseLine, variation: { color: 'noir', size: 'xxl' } }]);
      expect(itemsEqual(a[0]!, b[0]!)).toBe(false);
      expect(hasItemChanges(diffItems(a, b))).toBe(true);
    });

    it('treats identical variation as equal even when key/value casing differs', () => {
      const a = snapshotItems([baseLine]);
      const b = snapshotItems([{ ...baseLine, variation: { COLOR: 'Noir ', SIZE: 'XL' } }]);
      expect(itemsEqual(a[0]!, b[0]!)).toBe(true);
    });

    it('ignores empty/undefined variation values when comparing', () => {
      const a = snapshotItems([{ ...baseLine, variation: {} }]);
      const b = snapshotItems([{ ...baseLine, variation: null }]);
      expect(itemsEqual(a[0]!, b[0]!)).toBe(true);
    });

    it('a same-qty product swap is a change, reported as product field', () => {
      const a = snapshotItems([baseLine]);
      const b = snapshotItems([{ ...baseLine, productId: 'p2' }]);
      const diff = diffItems(a, b);
      expect(hasItemChanges(diff)).toBe(true);
      expect(diff.changed[0]?.fields.map((f) => f.field)).toEqual(['product']);
    });
  });

  describe('diffItems line identity', () => {
    it('a quantity change on the same line is reported in place with before/after values', () => {
      const a = snapshotItems([baseLine]);
      const b = snapshotItems([{ ...baseLine, qty: 3 }]);
      const diff = diffItems(a, b);
      expect(diff.changed).toHaveLength(1);
      expect(diff.changed[0]?.fields).toEqual([{ field: 'quantity', from: 1, to: 3 }]);
    });

    it('a variation change records the exact before/after map for the audit', () => {
      const a = snapshotItems([baseLine]);
      const b = snapshotItems([{ ...baseLine, variation: { color: 'gris', size: 'xxl' } }]);
      const diff = diffItems(a, b);
      expect(diff.changed[0]?.fields.find((f) => f.field === 'variation')).toEqual({
        field: 'variation',
        from: { color: 'noir', size: 'xl' },
        to: { color: 'gris', size: 'xxl' },
      });
    });

    it('a removed trailing line is reported as removed, not as a bogus change on a neighbor', () => {
      const a = snapshotItems([baseLine, { ...baseLine, productId: 'p2' }]);
      const b = snapshotItems([baseLine]);
      const diff = diffItems(a, b);
      expect(diff.removed).toHaveLength(1);
      expect(diff.removed[0]?.productId).toBe('p2');
      expect(diff.changed).toHaveLength(0);
    });

    it('a newly appended line is reported as added', () => {
      const a = snapshotItems([baseLine]);
      const b = snapshotItems([baseLine, { ...baseLine, productId: 'p2' }]);
      const diff = diffItems(a, b);
      expect(diff.added).toHaveLength(1);
      expect(diff.added[0]?.productId).toBe('p2');
    });

    it('a line whose position shifted reads as remove+add instead of an index-based in-place edit', () => {
      const a = snapshotItems([{ ...baseLine, productId: 'p1' }, { ...baseLine, productId: 'p2' }]);
      const b = snapshotItems([{ ...baseLine, productId: 'p2' }, { ...baseLine, productId: 'p1' }]);
      const diff = diffItems(a, b);
      expect(diff.changed).toHaveLength(2);
      expect(diff.changed[0]?.fields.map((f) => f.field)).toEqual(['product']);
      expect(diff.changed[1]?.fields.map((f) => f.field)).toEqual(['product']);
    });
  });

  describe('lineFieldChanges', () => {
    it('lists every changed field with before/after values (color, size, qty together)', () => {
      const from = snapshotItems([baseLine])[0]!;
      const to = snapshotItems([{ ...baseLine, variation: { color: 'gris', size: 'xxl' }, qty: 2 }])[0]!;
      const fields = lineFieldChanges(from, to);
      expect(fields).toEqual([
        { field: 'quantity', from: 1, to: 2 },
        { field: 'variation', from: { color: 'noir', size: 'xl' }, to: { color: 'gris', size: 'xxl' } },
      ]);
    });
  });

  describe('diffCustomer', () => {
    const baseCustomer = snapshotCustomer({
      firstName: 'Ahmed', lastName: '', phone: '20123456', phone2: '',
      email: '', city: 'Tunis', address: 'Rue 1', note: '',
    });

    it('reports only fields that actually changed', () => {
      const changed = diffCustomer(baseCustomer, { firstName: 'Ahmed', phone: '20123457', city: 'Sfax' });
      expect(changed).toEqual(['customer.phone', 'customer.city']);
    });

    it('an identical snapshot yields no changes', () => {
      expect(diffCustomer(baseCustomer, { ...baseCustomer })).toEqual([]);
    });

    it('undefined patch keys are skipped', () => {
      expect(diffCustomer(baseCustomer, { phone: undefined, address: undefined })).toEqual([]);
    });
  });
});
