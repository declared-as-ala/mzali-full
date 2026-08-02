import { encodeCode128B } from './code128';

describe('encodeCode128B', () => {
  it('total module width matches the Code128B formula for n data characters', () => {
    // start(11) + n*11 + checksum(11) + stop(13) = 11*(n+2) + 13
    const text = 'MZC-XXXX-XXXX-XX';
    const { totalModules } = encodeCode128B(text);
    expect(totalModules).toBe(11 * (text.length + 2) + 13);
  });

  it('is deterministic for the same input', () => {
    const a = encodeCode128B('MZC-ABCD-EFGH-12');
    const b = encodeCode128B('MZC-ABCD-EFGH-12');
    expect(a).toEqual(b);
  });

  it('produces a different bar sequence for a different card number', () => {
    const a = encodeCode128B('MZC-AAAA-AAAA-AA');
    const b = encodeCode128B('MZC-BBBB-BBBB-BB');
    expect(a.bars).not.toEqual(b.bars);
  });

  it('every bar starts within the total width and has a positive width', () => {
    const { bars, totalModules } = encodeCode128B('MZC-1234-5678-90');
    for (const bar of bars) {
      expect(bar.width).toBeGreaterThan(0);
      expect(bar.x + bar.width).toBeLessThanOrEqual(totalModules);
    }
  });

  it('rejects characters outside the Subset B range', () => {
    expect(() => encodeCode128B('café')).toThrow();
  });
});
