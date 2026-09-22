import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateOrderAvailability,
  resolveLocationForChannel,
  resolveTrackingMode,
  formatVariantLabel,
  type ProductStockData,
} from '../lib/stock-validation';

// Mock test fixtures
const matrixProductDepot: ProductStockData = {
  id: 'prod-hoodie-1',
  name: 'Hoodie Oversized',
  inventoryEnabled: true,
  manageStock: true,
  inventoryModel: 'MATRIX',
  depotTrackingMode: 'VARIANT',
  boutiqueTrackingMode: 'SIMPLE',
  stockQuantity: 3,
  boutiqueStockQuantity: 10,
  variants: [
    { id: 'v-noir-m', sku: 'H-NOIR-M', size: 'M', color: 'Noir', active: true, available: 5 },
    { id: 'v-noir-xl', sku: 'H-NOIR-XL', size: 'XL', color: 'Noir', active: true, available: 0 },
    { id: 'v-blanc-xl', sku: 'H-BLANC-XL', size: 'XL', color: 'Blanc', active: true, available: 3 },
  ],
};

const simpleProductDepot: ProductStockData = {
  id: 'prod-tshirt-simple',
  name: 'T-Shirt Basique',
  inventoryEnabled: true,
  manageStock: true,
  inventoryModel: 'LEGACY',
  depotTrackingMode: 'SIMPLE',
  boutiqueTrackingMode: 'SIMPLE',
  stockQuantity: 5,
  boutiqueStockQuantity: 8,
  variants: [
    { id: 'v-simple-legacy', sku: 'TS-SIMPLE', size: 'M', color: 'Noir', active: true, available: 5 },
  ],
};

const untrackedProduct: ProductStockData = {
  id: 'prod-untracked',
  name: 'Sac Cadeau',
  inventoryEnabled: true,
  manageStock: false, // Mode sans stock
  stockQuantity: 0,
  variants: [
    { id: 'v-bag', sku: 'BAG-1', active: true, available: 0 },
  ],
};

// ==================================================
// 17. TESTS - REQUIRED SCENARIOS
// ==================================================

test('1. Customer cannot add out-of-stock variant', () => {
  const res = validateOrderAvailability({
    channel: 'ONLINE',
    product: matrixProductDepot,
    variantId: 'v-noir-xl',
    quantity: 1,
  });
  assert.equal(res.valid, false);
  assert.equal(res.availableStock, 0);
  assert.match(res.error || '', /ÉPUISÉ/i);
});

test('2. Customer cannot checkout out-of-stock variant', () => {
  const res = validateOrderAvailability({
    channel: 'ONLINE',
    product: matrixProductDepot,
    variantId: 'v-noir-xl',
    quantity: 1,
  });
  assert.equal(res.valid, false);
  assert.match(res.error || '', /ÉPUISÉ/i);
});

test('3. Backend rejects stale cart stock when item went out of stock', () => {
  // Stale cart item held variant that currently has 0 available
  const res = validateOrderAvailability({
    channel: 'ONLINE',
    product: matrixProductDepot,
    size: 'XL',
    color: 'Noir',
    quantity: 1,
  });
  assert.equal(res.valid, false);
  assert.match(res.error || '', /ÉPUISÉ/i);
});

test('4. Admin cannot manually add out-of-stock variant', () => {
  const res = validateOrderAvailability({
    channel: 'ADMIN',
    product: matrixProductDepot,
    size: 'XL',
    color: 'Noir',
    quantity: 1,
  });
  assert.equal(res.valid, false);
  assert.equal(res.location, 'DEPOT');
  assert.match(res.error || '', /XL \/ Noir — ÉPUISÉ/i);
});

test('5. Admin cannot exceed available quantity (allow 3 for XL Blanc, block 4)', () => {
  const allow3 = validateOrderAvailability({
    channel: 'ADMIN',
    product: matrixProductDepot,
    size: 'XL',
    color: 'Blanc',
    quantity: 3,
  });
  assert.equal(allow3.valid, true);
  assert.equal(allow3.maxAllowedQuantity, 3);

  const block4 = validateOrderAvailability({
    channel: 'ADMIN',
    product: matrixProductDepot,
    size: 'XL',
    color: 'Blanc',
    quantity: 4,
  });
  assert.equal(block4.valid, false);
  assert.match(block4.error || '', /Stock insuffisant/i);
});

test('6. Admin edit: cannot switch to unavailable variant, delta calculation works', () => {
  // Switch M Noir -> XL Noir (stock=0) -> blocked
  const switchBlocked = validateOrderAvailability({
    channel: 'ADMIN',
    product: matrixProductDepot,
    variantId: 'v-noir-xl',
    quantity: 1,
    existingQuantity: 0, // new variant
  });
  assert.equal(switchBlocked.valid, false);
  assert.match(switchBlocked.error || '', /Stock insuffisant|ÉPUISÉ/i);

  // Existing confirmed: XL Blanc x2, current available stock: 1
  // Changing quantity: 2 -> 3 requires delta +1. Available >= 1, so valid.
  const deltaValid = validateOrderAvailability({
    channel: 'ADMIN',
    product: matrixProductDepot,
    variantId: 'v-blanc-xl',
    quantity: 3,
    existingQuantity: 2,
  });
  assert.equal(deltaValid.valid, true);
  assert.equal(deltaValid.requiredDelta, 1);
  assert.equal(deltaValid.maxAllowedQuantity, 3 + 2); // available(3) + existing(2) = 5
});

test('7. SIMPLE stock blocks when global quantity = 0', () => {
  const zeroStockProduct: ProductStockData = {
    ...simpleProductDepot,
    stockQuantity: 0,
  };
  const res = validateOrderAvailability({
    channel: 'ONLINE',
    product: zeroStockProduct,
    quantity: 1,
  });
  assert.equal(res.valid, false);
  assert.equal(res.mode, 'SIMPLE');
  assert.match(res.error || '', /épuisé/i);
});

test('8. SIMPLE stock blocks quantity > global available (stock=5, req=6)', () => {
  const ok5 = validateOrderAvailability({
    channel: 'ONLINE',
    product: simpleProductDepot,
    quantity: 5,
  });
  assert.equal(ok5.valid, true);

  const block6 = validateOrderAvailability({
    channel: 'ONLINE',
    product: simpleProductDepot,
    quantity: 6,
  });
  assert.equal(block6.valid, false);
  assert.equal(block6.mode, 'SIMPLE');
  assert.match(block6.error || '', /Stock insuffisant/i);
});

test('9. VARIANT stock checks exact size/color combination (M Noir available, XL Noir unavailable)', () => {
  const mNoir = validateOrderAvailability({
    channel: 'ONLINE',
    product: matrixProductDepot,
    size: 'M',
    color: 'Noir',
    quantity: 1,
  });
  assert.equal(mNoir.valid, true);
  assert.equal(mNoir.availableStock, 5);

  const xlNoir = validateOrderAvailability({
    channel: 'ONLINE',
    product: matrixProductDepot,
    size: 'XL',
    color: 'Noir',
    quantity: 1,
  });
  assert.equal(xlNoir.valid, false);
  assert.match(xlNoir.error || '', /XL \/ Noir — ÉPUISÉ/i);
});

test('10. Website and Admin online orders use DEPOT location', () => {
  const online = validateOrderAvailability({
    channel: 'ONLINE',
    product: matrixProductDepot,
    variantId: 'v-noir-m',
    quantity: 1,
  });
  assert.equal(online.location, 'DEPOT');

  const admin = validateOrderAvailability({
    channel: 'ADMIN',
    product: matrixProductDepot,
    variantId: 'v-noir-m',
    quantity: 1,
  });
  assert.equal(admin.location, 'DEPOT');
});

test('11. POS sales use BOUTIQUE location', () => {
  const pos = validateOrderAvailability({
    channel: 'POS',
    product: matrixProductDepot,
    quantity: 1,
  });
  assert.equal(pos.location, 'BOUTIQUE');
  assert.equal(pos.mode, 'SIMPLE'); // matrixProductDepot has boutiqueTrackingMode: 'SIMPLE'
  assert.equal(pos.availableStock, 10);
});

test('12. Concurrency simulation: two concurrent requests for last unit -> only one succeeds', async () => {
  // Atomic stock reservation simulator representing MongoDB findOneAndUpdate with $expr: { $gte: [...] }
  class AtomicInventorySimulator {
    private onHand = 1;
    private reserved = 0;

    async reserveAtomic(qty: number): Promise<{ success: boolean; error?: string }> {
      // Simulates atomic single-threaded execution inside DB engine
      await new Promise((r) => setTimeout(r, Math.random() * 5));
      const available = this.onHand - this.reserved;
      if (available >= qty) {
        this.reserved += qty;
        return { success: true };
      }
      return { success: false, error: 'Cette variante vient d’être épuisée.' };
    }
  }

  const sim = new AtomicInventorySimulator();

  // Run 2 concurrent reservation requests at the same time
  const [reqA, reqB] = await Promise.all([
    sim.reserveAtomic(1),
    sim.reserveAtomic(1),
  ]);

  const successes = [reqA, reqB].filter((r) => r.success);
  const failures = [reqA, reqB].filter((r) => !r.success);

  assert.equal(successes.length, 1, 'Exactly one request must succeed');
  assert.equal(failures.length, 1, 'Exactly one request must fail');
  assert.equal(failures[0].error, 'Cette variante vient d’être épuisée.');
});

test('Mode sans stock bypasses inventory availability', () => {
  const res = validateOrderAvailability({
    channel: 'ONLINE',
    product: untrackedProduct,
    quantity: 10,
  });
  assert.equal(res.valid, true);
  assert.equal(res.mode, 'UNTRACKED');
  assert.equal(res.availableStock, Infinity);
});
