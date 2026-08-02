import { normalizePhone, phonesMatch } from './phone';

describe('phone', () => {
  it('strips formatting and international prefixes', () => {
    expect(normalizePhone('20 123 456')).toBe('20123456');
    expect(normalizePhone('+216 20 123 456')).toBe('20123456');
    expect(normalizePhone('00216 20123456')).toBe('20123456');
    expect(normalizePhone('21620123456')).toBe('20123456');
  });

  it('keeps non-Tunisian numbers as digit strings', () => {
    expect(normalizePhone('+33 6 12 34 56 78')).toBe('33612345678');
  });

  it('handles empty inputs', () => {
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone(null)).toBe('');
    expect(normalizePhone(undefined)).toBe('');
  });

  it('matches loosely across formats', () => {
    expect(phonesMatch('+216 20 123 456', '20123456')).toBe(true);
    expect(phonesMatch('20123456', '20123457')).toBe(false);
    expect(phonesMatch('', '')).toBe(false);
  });
});
