export type ProductMediaInput = { mediaId: string; position: number; isPrimary: boolean };

export function primaryProductImage<T extends object>(images: T[] | null | undefined): T | undefined {
  return images?.find((image) => Boolean((image as { isPrimary?: boolean }).isPrimary)) ?? images?.[0];
}

export function normalizeProductMedia(items: ProductMediaInput[], max = 10): ProductMediaInput[] {
  if (items.length > max) throw new Error(`Maximum ${max} images par produit`);
  const ids = items.map((item) => item.mediaId);
  if (new Set(ids).size !== ids.length) throw new Error('Les images du produit contiennent des doublons');
  const ordered = [...items].sort((a, b) => a.position - b.position);
  if (ordered.some((item, index) => item.position !== index)) throw new Error('Les positions des images doivent être continues à partir de 0');
  if (ordered.length > 0 && ordered.filter((item) => item.isPrimary).length !== 1) throw new Error('Une seule image principale est requise');
  return ordered;
}

export function normalizeLegacyProductImages<T extends { mediaId: string | null; url: string; position?: number; isPrimary?: boolean }>(images: T[]): (T & { position: number; isPrimary: boolean })[] {
  const seen = new Set<string>();
  const unique = images
    .map((image, index) => ({ image, index }))
    .sort((a, b) => (a.image.position ?? a.index) - (b.image.position ?? b.index))
    .map(({ image }) => image)
    .filter((image) => {
      const identity = image.mediaId ?? image.url;
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  const requestedPrimary = unique.findIndex((image) => image.isPrimary);
  const primary = requestedPrimary >= 0 ? requestedPrimary : 0;
  return unique.map((image, position) => ({ ...image, position, isPrimary: position === primary }));
}
