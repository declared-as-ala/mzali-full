import assert from 'node:assert/strict';
import test from 'node:test';
import { analyze, buildGrid, currentTotal, formatPieces, initialDraft, parseQty, totals, type StockConfig, type StockVariantRow } from '../lib/stock-editor';

const row = (id: string, size: string, color: string, onHand: number, active = true, extra: Partial<StockVariantRow> = {}): StockVariantRow =>
  ({ id, sku: id, attributes: { size, color }, active, onHand, reserved: 0, ...extra });
const config = (variants: StockVariantRow[], over: Partial<StockConfig> = {}): StockConfig => ({
  productId: 'p', name: 'Bagy Marbrer', hasVariants: true,
  options: [{ label: 'couleur', values: ['blanc bl gris', 'gris bl blanc'] }, { label: 'tallie', values: ['S', 'M', 'L', 'XL', '2XL', '3XL'] }],
  variants, ...over,
});
const bagy = () => config([
  row('a1', 'S', 'blanc bl gris', 999), row('a2', 'M', 'blanc bl gris', 997), row('a3', 'L', 'blanc bl gris', 999),
  row('b1', 'S', 'gris bl blanc', 999), row('b2', 'M', 'gris bl blanc', 998), row('b3', 'L', 'gris bl blanc', 998),
]);

test('quantity input accepts only whole numbers >= 0', () => {
  assert.equal(parseQty('0'), 0);
  assert.equal(parseQty(' 12 '), 12);
  for (const bad of ['', '-1', '1.5', '1,5', 'abc', '12a', '1e3', '9999999999']) assert.equal(parseQty(bad), null, bad);
});

test('grid follows the Options order and marks nonexistent combinations', () => {
  const cfg = config([row('1', 'M', 'gris bl blanc', 1), row('2', 'S', 'blanc bl gris', 2), row('3', 'M', 'blanc bl gris', 3)]);
  const grid = buildGrid(cfg);
  assert.deepEqual(grid.colors, ['blanc bl gris', 'gris bl blanc']);
  assert.deepEqual(grid.sizes, ['S', 'M']); // option order, only sizes that exist
  assert.equal(grid.at('S', 'gris bl blanc'), undefined); // no such variant -> shown as a dash, never editable
  assert.equal(grid.at('m', 'BLANC BL GRIS')?.id, '3');
});

test('variants whose option was removed are not part of the editable grid', () => {
  const cfg = config([row('ok', 'S', 'blanc bl gris', 5), row('ghost', 'S', 'blanc gris', 9, false, { obsoleteByOptions: true })]);
  assert.deepEqual(buildGrid(cfg).colors, ['blanc bl gris']);
  assert.equal(currentTotal(cfg), 5);
  assert.deepEqual(analyze(cfg, initialDraft(cfg)).rows, []);
});

test('an untouched form has nothing to save', () => {
  const cfg = bagy();
  const a = analyze(cfg, initialDraft(cfg));
  assert.equal(a.dirty, false);
  assert.equal(a.canSave, false);
  assert.deepEqual(a.rows, []);
});

test('only changed cells are sent, each with the quantity the editor saw (stale-edit guard)', () => {
  const cfg = bagy();
  const d = initialDraft(cfg);
  d.qty.a3 = '0';
  d.qty.b2 = '1000';
  const a = analyze(cfg, d);
  assert.deepEqual(a.rows, [
    { variantId: 'a3', quantity: 0, expectedQuantity: 999 },
    { variantId: 'b2', quantity: 1000, expectedQuantity: 998 },
  ]);
  assert.deepEqual([...a.changedQty].sort(), ['a3', 'b2']);
  assert.equal(a.canSave, true);
});

test('availability changes are sent without touching stock, and stock is kept when disabling', () => {
  const cfg = bagy();
  const d = initialDraft(cfg);
  d.active.a2 = false;
  const a = analyze(cfg, d);
  assert.deepEqual(a.rows, [{ variantId: 'a2', active: false }]);
  assert.equal((a.rows[0] as { quantity?: number }).quantity, undefined); // stock 997 is not sent, so it is not modified
});

test('an invalid or blank quantity blocks saving and is flagged', () => {
  const cfg = bagy();
  for (const bad of ['', '-3', '2.5', 'x']) {
    const d = initialDraft(cfg);
    d.qty.a1 = bad;
    d.qty.b1 = '5';
    const a = analyze(cfg, d);
    assert.equal(a.canSave, false, bad);
    assert.ok(a.invalid.has('a1'));
  }
});

test('row, column and grand totals follow what is typed', () => {
  const cfg = bagy();
  const grid = buildGrid(cfg);
  const d = initialDraft(cfg);
  assert.equal(totals(cfg, grid, d).grand, 999 + 997 + 999 + 999 + 998 + 998);
  d.qty.a1 = '1';
  const t = totals(cfg, grid, d);
  assert.equal(t.byColor['blanc bl gris'], 1 + 997 + 999);
  assert.equal(t.bySize['s'], 1 + 999);
  d.qty.a1 = ''; // invalid keeps counting its saved value so totals never jump to nonsense
  assert.equal(totals(cfg, grid, d).byColor['blanc bl gris'], 999 + 997 + 999);
});

test('product WITHOUT variants: one quantity, one cell', () => {
  const cfg = config([row('only', '', '', 14)], { hasVariants: false, options: [] });
  const d = initialDraft(cfg);
  d.qty.only = '30';
  const a = analyze(cfg, d);
  assert.deepEqual(a.rows, [{ variantId: 'only', quantity: 30, expectedQuantity: 14 }]);
  assert.equal(currentTotal(cfg), 14);
});

test('formatting: French thousands separator and plural rules', () => {
  assert.match(formatPieces(11977), /^11\s?977 pièces$/);
  assert.equal(formatPieces(1), '1 pièce');
  assert.equal(formatPieces(0), '0 pièce');
});
