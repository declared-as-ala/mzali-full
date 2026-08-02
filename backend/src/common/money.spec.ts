import {
  addMinor,
  clampDiscount,
  multiplyMinor,
  parseToMinor,
  percentOfMinor,
  subtractMinor,
  toDinars,
  toMinor,
} from './money';

describe('money', () => {
  it('converts dinars to millimes and back', () => {
    expect(toMinor(19.9)).toBe(19900);
    expect(toMinor(60.993)).toBe(60993);
    expect(toMinor(120)).toBe(120000);
    expect(toDinars(19900)).toBe(19.9);
    expect(toDinars(120000)).toBe(120);
  });

  it('rounds float artifacts safely', () => {
    // 0.1 + 0.2 style artifacts must never leak into storage
    expect(toMinor(0.30000000000000004)).toBe(300);
    expect(toMinor(19.899999999999999)).toBe(19900);
  });

  it('parses Woo-style strings including comma decimals and empties', () => {
    expect(parseToMinor('19.900')).toBe(19900);
    expect(parseToMinor('19,9')).toBe(19900);
    expect(parseToMinor('')).toBe(0);
    expect(parseToMinor(null)).toBe(0);
    expect(parseToMinor(undefined)).toBe(0);
    expect(parseToMinor('not-a-number')).toBe(0);
    expect(parseToMinor(8)).toBe(8000);
  });

  it('does integer arithmetic', () => {
    expect(addMinor(19900, 8000)).toBe(27900);
    expect(subtractMinor(27900, 8000)).toBe(19900);
    expect(multiplyMinor(19900, 3)).toBe(59700);
  });

  it('rejects non-integer amounts in arithmetic', () => {
    expect(() => addMinor(19.9)).toThrow(TypeError);
    expect(() => multiplyMinor(19.9, 2)).toThrow(TypeError);
  });

  it('computes percentage discounts in millimes', () => {
    expect(percentOfMinor(19900, 10)).toBe(1990);
    expect(percentOfMinor(19999, 33)).toBe(6600); // rounds 6599.67
    expect(percentOfMinor(0, 50)).toBe(0);
  });

  it('clamps discounts to the discountable amount', () => {
    expect(clampDiscount(5000, 3000)).toBe(3000);
    expect(clampDiscount(2000, 3000)).toBe(2000);
    expect(clampDiscount(-100, 3000)).toBe(0);
  });
});
