import { combinationKey, dedupeOptionValues, resolveAxes, validCombinationKeys } from './variant-options';
import { parseOptionValues } from './product.mapper';

describe('variant-options', () => {
  it('preserves the exact admin label and never merges "blanc bl gris" into "blanc gris"', () => {
    expect(dedupeOptionValues(['blanc bl gris', 'gris bl blanc'])).toEqual(['blanc bl gris', 'gris bl blanc']);
    expect(combinationKey('s', 'blanc bl gris')).not.toBe(combinationKey('s', 'blanc gris'));
  });

  it('removes duplicates and blanks case-insensitively, keeping the first label as typed', () => {
    expect(dedupeOptionValues([' Noir ', 'noir', 'NOIR', '', 'Blanc'])).toEqual(['Noir', 'Blanc']);
    expect(parseOptionValues('A, a,B ,, B')).toEqual(['A', 'B']);
  });

  it('builds only the combinations of the CURRENT options', () => {
    const keys = validCombinationKeys([
      { label: 'tallie ', values: ['s', 'm', 'l'] },
      { label: 'couleur', values: ['blanc bl gris', 'gris bl blanc'] },
    ])!;
    expect(keys.size).toBe(6);
    expect(keys.has(combinationKey('m', 'blanc bl gris'))).toBe(true);
    expect(keys.has(combinationKey('m', 'blanc gris'))).toBe(false);
  });

  it('finds axes regardless of option order and returns null when undeterminable', () => {
    expect(resolveAxes([{ label: 'Couleur', values: ['a'] }, { label: 'Taille', values: ['s'] }])).toEqual({ size: ['s'], color: ['a'] });
    expect(validCombinationKeys([{ label: 'couleur', values: ['a'] }])).toBeNull();
    expect(validCombinationKeys([])).toBeNull();
  });
});
