import assert from 'node:assert/strict';
import test from 'node:test';
import {
  availabilityLabel, axesOf, changeSelection, clampQuantity, colorOptions, matchLegacy, maxQuantity, overbooked,
  resolveVariant, selectionOf, sizeOptions, type LiveStock, type LiveVariant,
} from '../lib/order-stock';

const v = (id: string, size: string, color: string, available: number, active = true): LiveVariant => ({ id, size, color, active, available });
const stock = (variants: LiveVariant[]): LiveStock => ({
  productId: 'p1', tracked: true, mode: 'VARIANT', variants, defaultVariantId: null, fetchedAt: 0,
  total: variants.filter((x) => x.active).reduce((s, x) => s + x.available, 0),
});
const simple = (total: number): LiveStock => ({ productId: 'p2', tracked: true, mode: 'SIMPLE', variants: [], defaultVariantId: 'dv', fetchedAt: 0, total });

const dg = stock([
  v('mn', 'M', 'Noir', 8), v('ln', 'L', 'Noir', 3), v('xln', 'XL', 'Noir', 0), v('xxln', 'XXL', 'Noir', 6),
  v('mb', 'M', 'Blanc', 4), v('xlb', 'XL', 'Blanc', 5),
]);

test('both axes exist: Couleur and Taille are separate selects', () => {
  assert.deepEqual(axesOf(dg), { color: true, size: true });
  assert.deepEqual(colorOptions(dg, '').map((c) => c.value), ['Noir', 'Blanc']);
  assert.deepEqual(sizeOptions(dg, '').map((c) => c.value), ['M', 'L', 'XL', 'XXL']);
});

test('choosing a color filters the sizes to combinations that exist', () => {
  assert.deepEqual(sizeOptions(dg, 'Blanc').map((c) => c.value), ['M', 'XL']);
  assert.deepEqual(sizeOptions(dg, 'noir').map((c) => c.value), ['M', 'L', 'XL', 'XXL']);
});

test('choosing a size filters the colors', () => {
  assert.deepEqual(colorOptions(dg, 'L').map((c) => c.value), ['Noir']);
  assert.deepEqual(colorOptions(dg, 'XXL').map((c) => c.value), ['Noir']);
  assert.deepEqual(colorOptions(dg, 'XL').map((c) => c.value), ['Noir', 'Blanc']);
});

test('a nonexistent combination is never offered or resolved', () => {
  const s = stock([v('mn', 'M', 'Noir', 4), v('ln', 'L', 'Noir', 2), v('xb', 'XL', 'Blanc', 7)]);
  assert.deepEqual(sizeOptions(s, 'Noir').map((c) => c.value), ['M', 'L']);
  assert.deepEqual(colorOptions(s, 'XL').map((c) => c.value), ['Blanc']);
  assert.equal(resolveVariant(s, { color: 'Noir', size: 'XL' }), undefined);
});

test('the two selects resolve ONE real variantId with its exact stock', () => {
  const r = resolveVariant(dg, { color: 'Noir', size: 'L' })!;
  assert.equal(r.id, 'ln');
  assert.equal(r.available, 3);
  assert.equal(resolveVariant(dg, { color: 'Noir', size: '' }), undefined);
});

test('sold-out values are flagged (disabled in the UI) and read ÉPUISÉ; available ones show their count', () => {
  const xl = sizeOptions(dg, 'Noir').find((c) => c.value === 'XL')!;
  assert.equal(xl.soldOut, true);
  assert.equal(availabilityLabel(xl.available), 'ÉPUISÉ');
  const m = sizeOptions(dg, 'Noir').find((c) => c.value === 'M')!;
  assert.deepEqual([m.soldOut, availabilityLabel(m.available)], [false, '8 disponibles']);
  assert.equal(colorOptions(dg, 'XL').find((c) => c.value === 'Noir')!.soldOut, true);
});

test('Noir + L shows 3 disponibles and the quantity is capped at 3 immediately', () => {
  const r = resolveVariant(dg, { color: 'Noir', size: 'L' })!;
  assert.equal(availabilityLabel(r.available), '3 disponibles');
  assert.deepEqual(clampQuantity(4, maxQuantity(dg, { variantId: r.id })), { qty: 3, notice: 'Seulement 3 unités disponibles.' });
});

test('changing the color resets a size that does not exist or is sold out in that color', () => {
  assert.deepEqual(changeSelection(dg, { color: 'Blanc', size: 'XL' }, 'color', 'Noir'), { color: 'Noir', size: '' });
  assert.deepEqual(changeSelection(dg, { color: 'Blanc', size: 'M' }, 'color', 'Noir'), { color: 'Noir', size: 'M' });
  const s = stock([v('mn', 'M', 'Noir', 4), v('xb', 'XL', 'Blanc', 7)]);
  assert.deepEqual(changeSelection(s, { color: 'Blanc', size: 'XL' }, 'color', 'Noir'), { color: 'Noir', size: '' });
});

test('changing the size resets a color that does not exist or is sold out in that size', () => {
  assert.deepEqual(changeSelection(dg, { color: 'Blanc', size: 'M' }, 'size', 'XXL'), { color: '', size: 'XXL' });
  assert.deepEqual(changeSelection(dg, { color: 'Noir', size: 'M' }, 'size', 'XL'), { color: '', size: 'XL' });
  assert.deepEqual(changeSelection(dg, { color: 'Noir', size: 'M' }, 'size', 'L'), { color: 'Noir', size: 'L' });
});

test('product with ONE option only: the missing selector is hidden and one value resolves the variant', () => {
  const onlySize = stock([v('m', 'M', '', 5), v('l', 'L', '', 0), v('xl', 'XL', '', 2)]);
  assert.deepEqual(axesOf(onlySize), { color: false, size: true });
  assert.equal(resolveVariant(onlySize, { color: '', size: 'XL' })!.id, 'xl');
  const onlyColor = stock([v('n', '', 'Noir', 5), v('b', '', 'Blanc', 1)]);
  assert.deepEqual(axesOf(onlyColor), { color: true, size: false });
  assert.equal(resolveVariant(onlyColor, { color: 'Blanc', size: '' })!.id, 'b');
});

test('product without variants: no selectors', () => {
  assert.deepEqual(axesOf(simple(14)), { color: false, size: false });
});

test('bundle slots use the same logic and their combined stock is still enforced', () => {
  const slot = resolveVariant(dg, { color: 'Noir', size: 'L' })!;
  const lines = [1, 2, 3, 4].map(() => ({ productId: 'p1', variantId: slot.id, qty: 1 }));
  assert.equal(overbooked(lines, { p1: dg }).length, 1);
  assert.equal(overbooked(lines.slice(0, 3), { p1: dg }).length, 0);
});

test('existing order edit: the saved variant fills both selects', () => {
  const sel = selectionOf(dg.variants.find((x) => x.id === 'xlb'));
  assert.deepEqual(sel, { color: 'Blanc', size: 'XL' });
  assert.equal(resolveVariant(dg, sel)!.id, 'xlb');
});

test('legacy order without variantId: resolved only when exactly one current variant matches', () => {
  assert.equal(matchLegacy(dg, { Taille: 'L', Couleur: 'noir' })!.id, 'ln');
  assert.equal(matchLegacy(dg, { size: 'xl', color: 'blanc' })!.id, 'xlb');
  assert.equal(matchLegacy(dg, { Taille: 'M' }), undefined); // M exists in two colors: ambiguous, keep historical values
  assert.equal(matchLegacy(dg, { Taille: '4XL', Couleur: 'Noir' }), undefined);
  assert.equal(matchLegacy(dg, {}), undefined);
});
