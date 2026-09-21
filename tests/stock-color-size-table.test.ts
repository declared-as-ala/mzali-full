import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import StockColorSizeTable from '../components/admin/StockColorSizeTable';
Object.assign(globalThis, { React });
test('stock table groups colors in rows and sizes in columns with correct totals', () => {
  const html = renderToStaticMarkup(React.createElement(StockColorSizeTable, { label: 'Stock', cells: [
    { size: 'S', color: 'Noir', quantity: 100 }, { size: 'M', color: 'Noir', quantity: 50 }, { size: 'L', color: 'Noir', quantity: 100 }, { size: 'S', color: 'Bleu', quantity: 20 },
  ] }));
  assert.match(html, /Couleur \/ Taille/);
  assert.match(html, />250<\/td>/);
  assert.match(html, /aria-label="Total général">270<\/td>/);
  assert.equal((html.match(/scope="col"/g) ?? []).length, 5);
  assert.equal((html.match(/Combinaison inexistante/g) ?? []).length, 2);
});
test('editable cells keep exact color and size labels, including zero stock', () => {
  const html = renderToStaticMarkup(React.createElement(StockColorSizeTable, { label: 'Stock', cells: [{ size: 'XL', color: 'Vert', quantity: 0 }], onChange: () => undefined }));
  assert.match(html, /aria-label="Stock Vert XL"/);
  assert.match(html, /value="0"/);
});
