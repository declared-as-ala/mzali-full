import { mapWooCategory } from './map-category';
import type { WooCategoryRaw } from '../woo-types';

describe('mapWooCategory', () => {
  it('maps a root category (parent 0) to parentLegacyId null', () => {
    const raw: WooCategoryRaw = { id: 1, name: 'Femme', slug: 'femme', description: '', count: 5, parent: 0, image: null };
    expect(mapWooCategory(raw).parentLegacyId).toBeNull();
  });

  it('maps a child category to its parent legacy id as a string', () => {
    const raw: WooCategoryRaw = { id: 2, name: 'Robes', slug: 'robes', description: '', count: 3, parent: 1, image: null };
    expect(mapWooCategory(raw).parentLegacyId).toBe('1');
  });

  it('extracts the image URL when present', () => {
    const raw: WooCategoryRaw = {
      id: 3, name: 'Homme', slug: 'homme', description: 'desc', count: 0, parent: 0,
      image: { id: 10, src: 'http://x/img.jpg', alt: '' },
    };
    const mapped = mapWooCategory(raw);
    expect(mapped.imageUrl).toBe('http://x/img.jpg');
    expect(mapped.legacyId).toBe('3');
  });
});
