import type { WooCategoryRaw } from '../woo-types';

export type MappedCategory = {
  legacyId: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  menuOrder: number;
  /** Woo's numeric parent id (0 = root); resolved to a Mongo _id in a second pass. */
  parentLegacyId: string | null;
};

export function mapWooCategory(raw: WooCategoryRaw): MappedCategory {
  return {
    legacyId: String(raw.id),
    name: raw.name,
    slug: raw.slug,
    description: raw.description ?? '',
    imageUrl: raw.image?.src ?? null,
    menuOrder: 0,
    parentLegacyId: raw.parent && raw.parent !== 0 ? String(raw.parent) : null,
  };
}
