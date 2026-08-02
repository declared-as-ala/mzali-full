import type { Category, CategoryListQuery } from '@/types';
import type { CategoryInput, CategoryService } from '../category-service';
import { apiRequest } from './client';
import { getValidAccessToken } from '@/lib/api-auth';

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
    const bearer = await getValidAccessToken();
    return apiRequest<Category>('/admin/categories', { method: 'POST', bearer: bearer ?? undefined, body: input });
  }

  async update(id: string, input: Partial<CategoryInput>): Promise<Category> {
    const bearer = await getValidAccessToken();
    return apiRequest<Category>(`/admin/categories/${id}`, { method: 'PUT', bearer: bearer ?? undefined, body: input });
  }

  async remove(id: string): Promise<void> {
    const bearer = await getValidAccessToken();
    await apiRequest(`/admin/categories/${id}`, { method: 'DELETE', bearer: bearer ?? undefined });
  }
}
