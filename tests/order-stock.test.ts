import assert from 'node:assert/strict';
import test from 'node:test';
import {
  availabilityLabel, clampQuantity, colorChoices, heldQuantity, isSoldOut, limitMessage, maxQuantity, overbooked, sizesForColor,
  type LiveStock, type LiveVariant,
} from '../lib/order-stock';

const v = (id: string, size: string, color: string, available: number, active = true): LiveVariant => ({ id, size, color, active, available });
const stock = (variants: LiveVariant[], over: Partial<LiveStock> = {}): LiveStock => ({
  productId: 'p1', tracked: true, mode: 'VARIANT', variants, defaultVariantId: null, fetchedAt: 0,
  total: variants.filter((x) => x.active).reduce((s, x) => s + x.available, 0), ...over,
});
const simple = (total: number, over: Partial<LiveStock> = {}): LiveStock => ({ productId: 'p2', tracked: true, mode: 'SIMPLE', variants: [], defaultVariantId: 'dv', fetchedAt: 0, total, ...over });

// The phone call: "DJIN 2CL, XL, Noir, quantity 20"
const djin = stock([v('s', 'S', 'Noir', 10), v('m', 'M', 'Noir', 5), v('l', 'L', 'Noir', 8), v('xl', 'XL', 'Noir', 10), v('xxl', 'XXL', 'Noir', 4)]);

test('selecting Noir/XL shows exactly 10 available and the product total is informative only', () => {
  assert.equal(djin.total, 37);
  assert.equal(maxQuantity(djin, { variantId: 'xl' }), 10);
  assert.equal(availabilityLabel(10), '10 disponibles');
  assert.equal(availabilityLabel(1), '1 disponible');
});

test('customer asks for 20: rejected immediately, clamped to 10 with the exact message', () => {
  const { qty, notice } = clampQuantity(20, maxQuantity(djin, { variantId: 'xl' }));
  assert.equal(qty, 10);
  assert.equal(notice, 'Seulement 10 unités disponibles.');
});

test('quantity 10 is allowed, 11 is blocked before Save', () => {
  const max = maxQuantity(djin, { variantId: 'xl' });
  assert.deepEqual(clampQuantity(10, max), { qty: 10, notice: null });
  assert.equal(clampQuantity(11, max).qty, 10);
  assert.equal(clampQuantity(11, max).notice, 'Seulement 10 unités disponibles.');
});

test('singular wording for one unit', () => {
  assert.equal(limitMessage(1), 'Seulement 1 unité disponible.');
});

test('a sold-out variant (stock 0) cannot be ordered: ÉPUISÉ, quantity forced back', () => {
  const s = stock([v('a', 'M', 'Noir', 3), v('b', 'XL', 'Noir', 0)]);
  assert.equal(maxQuantity(s, { variantId: 'b' }), 0);
  assert.equal(limitMessage(0), 'ÉPUISÉ');
  assert.deepEqual(clampQuantity(2, maxQuantity(s, { variantId: 'b' })), { qty: 1, notice: 'ÉPUISÉ' });
  assert.equal(availabilityLabel(0), 'ÉPUISÉ');
});

test('product total never approves a sold-out variant', () => {
  const s = stock([v('a', 'M', 'Noir', 30), v('b', 'XL', 'Noir', 0)]);
  assert.equal(s.total, 30);
  assert.equal(maxQuantity(s, { variantId: 'b' }), 0);
});

test('NON-EXISTENT combinations are never offered: Noir shows M and L only, not XL', () => {
  // product has M/Noir, L/Noir, XL/Blanc — there is no XL/Noir
  const s = stock([v('mn', 'M', 'Noir', 4), v('ln', 'L', 'Noir', 2), v('xb', 'XL', 'Blanc', 7)]);
  assert.deepEqual(sizesForColor(s, 'Noir').map((x) => x.size), ['M', 'L']);
  assert.deepEqual(sizesForColor(s, 'Blanc').map((x) => x.size), ['XL']);
  assert.deepEqual(colorChoices(s).map((c) => c.color), ['Noir', 'Blanc']);
});

test('a DISABLED variant is not offered even though it holds stock', () => {
  const s = stock([v('a', 'XL', 'Noir', 5, false), v('b', 'M', 'Noir', 4)]);
  assert.deepEqual(sizesForColor(s, 'Noir').map((x) => x.size), ['M']);
  assert.equal(s.total, 4);
  assert.equal(maxQuantity(s, { variantId: 'a' }), null); // not selectable at all
});

test('colors with only sold-out sizes are flagged; case/space differences do not split a color', () => {
  const s = stock([v('a', 'S', 'Noir', 0), v('b', 'M', ' noir ', 0), v('c', 'S', 'Blanc', 2)]);
  const choices = colorChoices(s);
  assert.equal(choices.length, 2);
  assert.equal(choices.find((c) => c.color.trim().toLowerCase() === 'noir')!.soldOut, true);
  assert.equal(choices.find((c) => c.color === 'Blanc')!.soldOut, false);
});

test('product WITHOUT variants: stock 5 -> qty 5 allowed, qty 6 blocked', () => {
  const s = simple(5);
  const max = maxQuantity(s, {});
  assert.equal(max, 5);
  assert.deepEqual(clampQuantity(5, max), { qty: 5, notice: null });
  assert.equal(clampQuantity(6, max).qty, 5);
});

test('product without variants and stock 0 cannot be added', () => {
  assert.equal(isSoldOut(simple(0)), true);
  assert.equal(isSoldOut(simple(14)), false);
});

test('untracked stock or unknown stock never limits the employee', () => {
  assert.equal(maxQuantity(stock([v('a', 'S', 'Noir', 1)], { tracked: false }), { variantId: 'a' }), null);
  assert.equal(maxQuantity(undefined, { variantId: 'a' }), null);
  assert.equal(isSoldOut(simple(0, { tracked: false })), false);
});

test('CONFIRMED-ORDER EDIT: 5 held + 3 free => up to 8; 5 -> 7 needs 2 (ok), 5 -> 9 needs 4 (rejected)', () => {
  const s = stock([v('xl', 'XL', 'Noir', 3)]);
  const held = heldQuantity([{ productId: 'p1', variantId: 'xl', qty: 5 }], { productId: 'p1', variantId: 'xl' });
  assert.equal(held, 5);
  const max = maxQuantity(s, { variantId: 'xl' }, held);
  assert.equal(max, 8);
  assert.equal(clampQuantity(7, max).qty, 7);
  assert.equal(clampQuantity(9, max).qty, 8);
});

test('held units are only those of the same variant/product', () => {
  const saved = [{ productId: 'p1', variantId: 'xl', qty: 5 }, { productId: 'p1', variantId: 'm', qty: 2 }, { productId: 'p9', variantId: 'xl', qty: 4 }];
  assert.equal(heldQuantity(saved, { productId: 'p1', variantId: 'm' }), 2);
  assert.equal(heldQuantity(saved, { productId: 'p1', variantId: 'zzz' }), 0);
});

test('BUNDLE slots that pick the same variant must fit together', () => {
  const s = stock([v('xl', 'XL', 'Noir', 2)]);
  const lines = [{ productId: 'p1', variantId: 'xl', qty: 1 }, { productId: 'p1', variantId: 'xl', qty: 1 }, { productId: 'p1', variantId: 'xl', qty: 1 }];
  const bad = overbooked(lines, { p1: s });
  assert.equal(bad.length, 1);
  assert.deepEqual([bad[0].requested, bad[0].max], [3, 2]);
  assert.equal(overbooked(lines.slice(0, 2), { p1: s }).length, 0);
});

test('overbooked ignores variants not chosen yet and untracked products', () => {
  const s = stock([v('xl', 'XL', 'Noir', 1)]);
  assert.equal(overbooked([{ productId: 'p1', variantId: null, qty: 50 }], { p1: s }).length, 0);
  assert.equal(overbooked([{ productId: 'p1', variantId: 'xl', qty: 50 }], { p1: { ...s, tracked: false } }).length, 0);
});

test('overbooked for a confirmed order counts its own held units as free', () => {
  const s = stock([v('xl', 'XL', 'Noir', 3)]);
  const saved = [{ productId: 'p1', variantId: 'xl', qty: 5 }];
  assert.equal(overbooked([{ productId: 'p1', variantId: 'xl', qty: 8 }], { p1: s }, saved).length, 0);
  assert.equal(overbooked([{ productId: 'p1', variantId: 'xl', qty: 9 }], { p1: s }, saved).length, 1);
});

test('stock that changes while the drawer is open turns a valid line into a warning', () => {
  const before = stock([v('xl', 'XL', 'Noir', 10)]);
  const lines = [{ productId: 'p1', variantId: 'xl', qty: 10 }];
  assert.equal(overbooked(lines, { p1: before }).length, 0);
  const after = stock([v('xl', 'XL', 'Noir', 7)]); // another sale took 3
  const bad = overbooked(lines, { p1: after });
  assert.equal(bad.length, 1);
  assert.equal(limitMessage(bad[0].max), 'Seulement 7 unités disponibles.');
});

test('simple products sharing one quantity across lines are summed', () => {
  const s = simple(5);
  const lines = [{ productId: 'p2', qty: 3 }, { productId: 'p2', qty: 3 }];
  assert.equal(overbooked(lines, { p2: s }).length, 1);
});
