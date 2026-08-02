import { extractNavexBarcode, isNavexSuccessStatus, navexStatusMessage, normalizeGov } from './navex.helpers';

describe('normalizeGov', () => {
  it('returns the canonical spelling for an exact match', () => {
    expect(normalizeGov('Tunis')).toBe('Tunis');
  });

  it('normalizes loose/aliased input to the exact Navex spelling', () => {
    expect(normalizeGov('kef')).toBe('Le Kef');
    expect(normalizeGov('Manouba')).toBe('La Manouba');
    expect(normalizeGov('beja')).toBe('Béja');
    expect(normalizeGov('gabes')).toBe('Gabès');
  });

  it('is diacritic and case insensitive', () => {
    expect(normalizeGov('béJA')).toBe('Béja');
    expect(normalizeGov('MEDENINE')).toBe('Médenine');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeGov('')).toBe('');
  });

  it('falls back to the raw input when nothing matches', () => {
    expect(normalizeGov('Narnia')).toBe('Narnia');
  });
});

describe('extractNavexBarcode', () => {
  it('extracts a numeric barcode from a plain string', () => {
    expect(extractNavexBarcode('Shipment added, code 12345678')).toBe('12345678');
  });

  it('extracts from known object keys', () => {
    expect(extractNavexBarcode({ code_a_barre: '87654321' })).toBe('87654321');
    expect(extractNavexBarcode({ tracking_number: 99887766 })).toBe('99887766');
  });

  it('recurses into a nested data object', () => {
    expect(extractNavexBarcode({ data: { code: '11223344' } })).toBe('11223344');
  });

  it('returns undefined when nothing matches', () => {
    expect(extractNavexBarcode({ foo: 'bar' })).toBeUndefined();
    expect(extractNavexBarcode(null)).toBeUndefined();
  });
});

describe('navexStatusMessage / isNavexSuccessStatus', () => {
  it('reads status_message or message', () => {
    expect(navexStatusMessage({ status_message: 'Added' })).toBe('Added');
    expect(navexStatusMessage({ message: 'oops' })).toBe('oops');
  });

  it('detects success via numeric/boolean/string status', () => {
    expect(isNavexSuccessStatus({ status: 1 })).toBe(true);
    expect(isNavexSuccessStatus({ status: '1' })).toBe(true);
    expect(isNavexSuccessStatus({ status: true })).toBe(true);
  });

  it('detects success via a status_message containing success keywords', () => {
    expect(isNavexSuccessStatus({ status_message: 'Colis ajouté avec succès' })).toBe(true);
    expect(isNavexSuccessStatus({ status_message: 'added' })).toBe(true);
  });

  it('treats anything else as failure', () => {
    expect(isNavexSuccessStatus({ status: 0 })).toBe(false);
    expect(isNavexSuccessStatus({})).toBe(false);
    expect(isNavexSuccessStatus(null)).toBe(false);
  });
});
