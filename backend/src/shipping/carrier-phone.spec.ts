import { normalizeCarrierString, sanitizeCarrierPhone } from './carrier-phone';

describe('sanitizeCarrierPhone', () => {
  it('strips spaces, dashes, and parentheses', () => {
    expect(sanitizeCarrierPhone('20 123-456')).toBe('20123456');
  });

  it('strips a +216 or 00216 country prefix', () => {
    expect(sanitizeCarrierPhone('+21620123456')).toBe('20123456');
    expect(sanitizeCarrierPhone('0021620123456')).toBe('20123456');
  });

  it('strips a leading zero', () => {
    expect(sanitizeCarrierPhone('020123456')).toBe('20123456');
  });
});

describe('normalizeCarrierString', () => {
  it('folds diacritics and lowercases', () => {
    expect(normalizeCarrierString('Béja')).toBe('beja');
    expect(normalizeCarrierString('MÉDENINE')).toBe('medenine');
  });

  it('handles empty/undefined/null', () => {
    expect(normalizeCarrierString('')).toBe('');
    expect(normalizeCarrierString(undefined)).toBe('');
    expect(normalizeCarrierString(null)).toBe('');
  });
});
