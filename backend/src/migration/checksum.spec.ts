import { checksumOf } from './checksum';

describe('checksumOf', () => {
  it('produces the same checksum for identical objects regardless of instance', () => {
    expect(checksumOf({ a: 1, b: 2 })).toBe(checksumOf({ a: 1, b: 2 }));
  });

  it('produces different checksums for different values', () => {
    expect(checksumOf({ a: 1 })).not.toBe(checksumOf({ a: 2 }));
  });

  it('is sensitive to key order (documented limitation — callers must serialize consistently)', () => {
    // JSON.stringify preserves insertion order for string keys, so {a,b} != {b,a}.
    // This is fine for our use (we always build the source object the same way).
    expect(checksumOf({ a: 1, b: 2 })).not.toBe(checksumOf({ b: 2, a: 1 }));
  });

  it('returns a 64-character hex string (sha256)', () => {
    expect(checksumOf('anything')).toMatch(/^[0-9a-f]{64}$/);
  });
});
