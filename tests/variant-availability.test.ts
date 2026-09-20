import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import VariantSelector from '../components/site/VariantSelector';
import { getDictionary } from '../lib/i18n';

// The application's Next compiler supplies React automatically. tsx's test
// compiler uses the classic JSX runtime for this workspace.
Object.assign(globalThis, { React });
const variants = [
  { id: 'black-m', sku: 'M-NOIR', size: 'M', color: 'Noir', active: true, available: 2, price: 59 },
  { id: 'black-xl', sku: 'XL-NOIR', size: 'XL', color: 'Noir', active: true, available: 0, price: 59 },
  { id: 'white-xl', sku: 'XL-BLANC', size: 'XL', color: 'Blanc', active: true, available: 4, price: 59 },
];
const render = (stockEnabled: boolean, value?: string) => renderToStaticMarkup(React.createElement(VariantSelector, { variants, stockEnabled, value, onChange: () => undefined }));

test('website disables XL Noir at zero stock while M Noir stays selectable', () => {
  const html = render(true);
  assert.match(html, /<button[^>]*disabled=""[^>]*>XL · Épuisé<\/button>/);
  assert.match(html, /<button(?![^>]*disabled="")[^>]*>M<\/button>/);
  assert.equal(getDictionary('fr').product.outOfStock, 'Épuisé');
});

test('changing to Blanc uses Blanc stock rather than Noir stock', () => {
  const html = render(true, 'white-xl');
  assert.doesNotMatch(html, /disabled=""/);
  assert.match(html, />XL<\/button>/);
});

test('mode sans stock keeps the zero-stock size purchasable', () => {
  const html = render(false);
  assert.doesNotMatch(html, /disabled=""|Épuisé/);
  assert.match(html, />XL<\/button>/);
});
