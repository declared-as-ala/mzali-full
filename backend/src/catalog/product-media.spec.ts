import { normalizeLegacyProductImages, normalizeProductMedia, primaryProductImage } from './product-media';

describe('product media contract', () => {
  it('keeps explicit deterministic order regardless of payload order', () => {
    expect(normalizeProductMedia([
      { mediaId: 'C', position: 2, isPrimary: false },
      { mediaId: 'A', position: 0, isPrimary: true },
      { mediaId: 'B', position: 1, isPrimary: false },
    ]).map((item) => item.mediaId)).toEqual(['A', 'B', 'C']);
  });

  it('rejects duplicate ids, gaps, and ambiguous primary state', () => {
    expect(() => normalizeProductMedia([{ mediaId: 'A', position: 0, isPrimary: true }, { mediaId: 'A', position: 1, isPrimary: false }])).toThrow('doublons');
    expect(() => normalizeProductMedia([{ mediaId: 'A', position: 2, isPrimary: true }])).toThrow('continues');
    expect(() => normalizeProductMedia([{ mediaId: 'A', position: 0, isPrimary: false }])).toThrow('principale');
  });

  it('normalizes legacy url-only data without losing photos', () => {
    expect(normalizeLegacyProductImages([
      { mediaId: null, url: '/b.jpg', position: 9 },
      { mediaId: null, url: '/a.jpg', position: 2 },
      { mediaId: null, url: '/a.jpg', position: 4 },
    ])).toEqual([
      { mediaId: null, url: '/a.jpg', position: 0, isPrimary: true },
      { mediaId: null, url: '/b.jpg', position: 1, isPrimary: false },
    ]);
  });

  it('resolves the same explicit cover independently from array position', () => {
    expect(primaryProductImage([{ id: 'A' }, { id: 'B', isPrimary: true }, { id: 'C' }])?.id).toBe('B');
  });
});
