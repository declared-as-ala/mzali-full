import assert from 'node:assert/strict';
import test from 'node:test';
import { productStockRows } from '../lib/product-stock-options';
const options = [{ label: 'couleur ', values: ['Noir', 'Blanc', 'Gris', 'Vert'] }, { label: 'tallie ', values: ['M', 'L', 'XL', 'XXL'] }];
test('saved options automatically show all 16 combinations with zero quantities', () => {
  const rows = productStockRows('product-1', options);
  assert.equal(rows.length, 16);
  assert.equal(new Set(rows.map(r => r.sku)).size, 16);
  assert.ok(rows.every(r => r.depot === 0 && r.boutique === 0));
});
test('regenerating keeps quantities and identities already entered', () => {
  const previous = productStockRows('product-1', options);
  previous[0].depot = 7;
  const next = productStockRows('product-1', options, previous);
  assert.equal(next[0].depot, 7);
  assert.equal(next[0].sku, previous[0].sku);
});
test('option values containing commas are preserved rather than split', () => {
  const rows = productStockRows('product-1', [{ label: 'Taille', values: ['XL', ' xl '] }, { label: 'Couleur', values: ['Noir, blanc'] }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].color, 'Noir, blanc');
});
