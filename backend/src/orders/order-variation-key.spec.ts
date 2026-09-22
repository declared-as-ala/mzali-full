import { computeVariantVariationKey, computeVariationKey } from './order-variation-key';

describe('computeVariationKey — legacy order item snapshots', () => {
  it('computes a normalized key from French-labeled Taille/Couleur', () => {
    expect(computeVariationKey({ Taille: 'XL', Couleur: 'Noir' })).toBe('xl|noir');
  });

  it('computes the same key regardless of key casing (size/color, SIZE/COLOR, Taille/Couleur)', () => {
    const a = computeVariationKey({ size: 'xl', color: 'noir' });
    const b = computeVariationKey({ SIZE: 'XL', COLOR: 'NOIR' });
    const c = computeVariationKey({ Taille: 'Xl', Couleur: 'Noir' });
    expect(a).toBe('xl|noir');
    expect(b).toBe('xl|noir');
    expect(c).toBe('xl|noir');
  });

  it('accepts the misspelled "tallie"/"taile" key variants seen in real legacy data', () => {
    expect(computeVariationKey({ tallie: 'M', couleur: 'Blanc' })).toBe('m|blanc');
    expect(computeVariationKey({ taile: 'L', color: 'Vert' })).toBe('l|vert');
  });

  it('trims whitespace and normalizes accents/case consistently', () => {
    expect(computeVariationKey({ Taille: '  XL ', Couleur: 'noir' })).toBe('xl|noir');
  });

  it('returns null when the snapshot is missing size or color', () => {
    expect(computeVariationKey({ Taille: 'XL' })).toBeNull();
    expect(computeVariationKey({ Couleur: 'Noir' })).toBeNull();
    expect(computeVariationKey({})).toBeNull();
    expect(computeVariationKey(null)).toBeNull();
    expect(computeVariationKey(undefined)).toBeNull();
  });

  it('returns null when a key maps ambiguously to more than one size or color entry', () => {
    expect(computeVariationKey({ Taille: 'XL', size: 'M', Couleur: 'Noir' })).toBeNull();
  });

  it('ignores empty-string values rather than treating them as a real size/color', () => {
    expect(computeVariationKey({ Taille: '', Couleur: 'Noir' })).toBeNull();
  });
});

describe('computeVariantVariationKey — current Variant attributes', () => {
  it('computes the same normalized form as computeVariationKey for the equivalent size/color', () => {
    expect(computeVariantVariationKey({ size: 'XL', color: 'Noir' })).toBe('xl|noir');
    expect(computeVariationKey({ Taille: 'XL', Couleur: 'Noir' })).toBe(computeVariantVariationKey({ size: 'XL', color: 'Noir' }));
  });

  it('returns null when attributes has no size/color (non-matrix product default variant)', () => {
    expect(computeVariantVariationKey({})).toBeNull();
    expect(computeVariantVariationKey(null)).toBeNull();
    expect(computeVariantVariationKey({ size: 'XL' })).toBeNull();
  });
});
