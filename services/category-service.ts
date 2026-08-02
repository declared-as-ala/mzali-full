import type { Category, CategoryListQuery } from '@/types';

export type CategoryInput = {
  name: string;
  slug?: string;
  parentId?: string | null;
  description?: string;
};

export interface CategoryService {
  list(query?: CategoryListQuery): Promise<Category[]>;
  getBySlug(slug: string): Promise<Category | null>;
  create(input: CategoryInput): Promise<Category>;
  update(id: string, input: Partial<CategoryInput>): Promise<Category>;
  remove(id: string): Promise<void>;
}
