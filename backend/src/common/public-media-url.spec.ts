import { normalizePublicMediaUrl } from './public-media-url';

const PUBLIC_BASE = 'https://media.ahmedmzaliboutique.tn/';

describe('normalizePublicMediaUrl', () => {
  it('replaces a legacy localhost MinIO origin', () => {
    expect(
      normalizePublicMediaUrl('http://localhost:9002/catalog/product.jpg', PUBLIC_BASE),
    ).toBe('https://media.ahmedmzaliboutique.tn/catalog/product.jpg');
  });

  it('replaces an internal Docker MinIO origin and preserves the query', () => {
    expect(
      normalizePublicMediaUrl('http://minio:9000/categories/women.webp?v=2', PUBLIC_BASE),
    ).toBe('https://media.ahmedmzaliboutique.tn/categories/women.webp?v=2');
  });

  it('normalizes a relative public media path', () => {
    expect(normalizePublicMediaUrl('/banners/summer.webp', PUBLIC_BASE)).toBe(
      'https://media.ahmedmzaliboutique.tn/banners/summer.webp',
    );
  });

  it('leaves external product images untouched', () => {
    const external = 'https://supplier.example/wp-content/uploads/product.jpg';
    expect(normalizePublicMediaUrl(external, PUBLIC_BASE)).toBe(external);
  });

  it('leaves private document URLs untouched', () => {
    const document = 'http://localhost:9002/documents/invoice.pdf';
    expect(normalizePublicMediaUrl(document, PUBLIC_BASE)).toBe(document);
  });

  it('preserves null', () => {
    expect(normalizePublicMediaUrl(null, PUBLIC_BASE)).toBeNull();
  });
});
