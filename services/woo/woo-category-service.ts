import type { Category, CategoryListQuery } from '@/types';
import type { CategoryInput, CategoryService } from '../category-service';
import { wooClient } from './woo-client';
import type { WooCategoryRaw } from './woo-types';
import { mapCategory } from './woo-mappers';

function toWoo(input: Partial<CategoryInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.name !== undefined) out.name = input.name;
  if (input.slug !== undefined) out.slug = input.slug;
  if (input.description !== undefined) out.description = input.description;
  if (input.parentId !== undefined) out.parent = input.parentId ? Number(input.parentId) : 0;
  return out;
}

export class WooCommerceCategoryService implements CategoryService {
  async list(query: CategoryListQuery = {}): Promise<Category[]> {
    const res = await wooClient.get<WooCategoryRaw[]>('/products/categories', {
      per_page: query.perPage ?? 100,
      hide_empty: query.hideEmpty ?? true,
      parent: query.parentId ?? undefined,
    });
    return res.data.map(mapCategory);
  }
  async getBySlug(slug: string): Promise<Category | null> {
    const res = await wooClient.get<WooCategoryRaw[]>('/products/categories', { slug, per_page: 1 });
    return res.data[0] ? mapCategory(res.data[0]) : null;
  }
  async create(input: CategoryInput): Promise<Category> {
    const res = await wooClient.post<WooCategoryRaw>('/products/categories', toWoo(input));
    return mapCategory(res.data);
  }
  async update(id: string, input: Partial<CategoryInput>): Promise<Category> {
    const res = await wooClient.put<WooCategoryRaw>(`/products/categories/${id}`, toWoo(input));
    return mapCategory(res.data);
  }
  async remove(id: string): Promise<void> {
    await wooClient.del(`/products/categories/${id}`);
  }
}
