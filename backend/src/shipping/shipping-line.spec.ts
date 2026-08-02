import { buildCarrierDesignation } from './shipping-line';

describe('buildCarrierDesignation', () => {
  it('returns an empty designation for no items', () => {
    expect(buildCarrierDesignation([])).toEqual({ designation: '', nbArticle: 1 });
  });

  it('formats a simple item with quantity', () => {
    const r = buildCarrierDesignation([{ productId: '1', name: 'Robe Rouge', qty: 2 }]);
    expect(r).toEqual({ designation: 'robe rouge x 2', nbArticle: 2 });
  });

  it('appends variation values in parentheses, lowercased and deduplicated', () => {
    const r = buildCarrierDesignation([
      { productId: '1', name: 'Chemise', qty: 1, variation: { Taille: 'M', Couleur: 'Bleu' } },
    ]);
    expect(r.designation).toBe('chemise (m, bleu) x 1');
  });

  it('ignores an "offre" variation key', () => {
    const r = buildCarrierDesignation([
      { productId: '1', name: 'Pack', qty: 1, variation: { Offre: 'Pack 2', Taille: 'L' } },
    ]);
    expect(r.designation).toBe('pack (l) x 1');
  });

  it('parses "Item N" bundle-slot attributes into their values', () => {
    const r = buildCarrierDesignation([
      {
        productId: '1',
        name: 'Bundle',
        qty: 1,
        attributes: [{ key: 'Item 1', value: 'TAILLE: XXL · COULEUR: BLANC' }],
      },
    ]);
    expect(r.designation).toBe('bundle (xxl, blanc) x 1');
  });

  it('sums quantities across multiple lines for nbArticle', () => {
    const r = buildCarrierDesignation([
      { productId: '1', name: 'A', qty: 2 },
      { productId: '2', name: 'B', qty: 3 },
    ]);
    expect(r.nbArticle).toBe(5);
    expect(r.designation).toBe('a x 2 | b x 3');
  });

  it('accepts OrderLineItem-style objects using quantity instead of qty', () => {
    const r = buildCarrierDesignation([{ productId: '1', name: 'X', quantity: 4 }]);
    expect(r.nbArticle).toBe(4);
  });

  it('truncates a very long designation to 200 characters', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ productId: String(i), name: `Produit numero ${i}`, qty: 1 }));
    const r = buildCarrierDesignation(items);
    expect(r.designation.length).toBeLessThanOrEqual(200);
  });
});
