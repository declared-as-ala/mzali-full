import type { Category, CategoryListQuery } from '@/types';
import type { CategoryInput, CategoryService } from '../category-service';
import { apiRequest } from './client';
import { withAuthRetry } from './with-auth-retry';

export class MzaliApiCategoryService implements CategoryService {
  async list(query: CategoryListQuery = {}): Promise<Category[]> {
    return apiRequest<Category[]>('/catalog/categories', {
      serviceToken: true,
      query: { hideEmpty: query.hideEmpty, parentId: query.parentId ?? undefined, perPage: query.perPage },
    });
  }

  async getBySlug(slug: string): Promise<Category | null> {
    try {
      return await apiRequest<Category>(`/catalog/categories/slug/${encodeURIComponent(slug)}`, { serviceToken: true });
    } catch {
      return null;
    }
  }

  async create(input: CategoryInput): Promise<Category> {
    return withAuthRetry((bearer) =>
      apiRequest<Category>('/admin/categories', { method: 'POST', bearer, body: input }),
    );
  }

  async update(id: string, input: Partial<CategoryInput>): Promise<Category> {
    return withAuthRetry((bearer) =>
      apiRequest<Category>(`/admin/categories/${id}`, { method: 'PUT', bearer, body: input }),
    );
  }

  async remove(id: string): Promise<void> {
    await withAuthRetry((bearer) => apiRequest(`/admin/categories/${id}`, { method: 'DELETE', bearer }));
  }
}
