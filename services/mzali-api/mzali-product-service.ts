import type { Product, ProductListQuery, ProductListResult } from '@/types';
import type { ProductInput, ProductService } from '../product-service';
import { apiRequest } from './client';
import { withAuthRetry } from './with-auth-retry';

export class MzaliApiProductService implements ProductService {
  async list(query: ProductListQuery = {}): Promise<ProductListResult> {
    return apiRequest<ProductListResult>('/catalog/products', {
      serviceToken: true,
      query: {
        page: query.page,
        perPage: query.perPage,
        search: query.search,
        status: query.status,
        categorySlug: query.categorySlug,
        categoryId: query.categoryId,
        orderBy: query.orderBy,
        order: query.order,
        onSale: query.onSale,
        featured: query.featured,
      },
    });
  }

  async getBySlug(slug: string): Promise<Product | null> {
    try {
      return await apiRequest<Product>(`/catalog/products/slug/${encodeURIComponent(slug)}`, { serviceToken: true });
    } catch {
      return null;
    }
  }

  async getById(id: string): Promise<Product | null> {
    try {
      return await apiRequest<Product>(`/catalog/products/${id}`, { serviceToken: true });
    } catch {
      return null;
    }
  }

  async getRelated(productId: string, limit = 4): Promise<Product[]> {
    try {
      return await apiRequest<Product[]>(`/catalog/products/${productId}/related`, {
        serviceToken: true,
        query: { limit },
      });
    } catch {
      return [];
    }
  }

  async listAdmin(query: ProductListQuery = {}): Promise<ProductListResult> {
    return withAuthRetry((bearer) =>
      apiRequest<ProductListResult>('/admin/products', {
        bearer,
        query: {
          page: query.page,
          perPage: query.perPage,
          search: query.search,
          status: query.status,
          categorySlug: query.categorySlug,
          categoryId: query.categoryId,
          orderBy: query.orderBy,
          order: query.order,
          onSale: query.onSale,
          featured: query.featured,
        },
      }),
    );
  }

  async getByIdAdmin(id: string): Promise<Product | null> {
    try {
      return await withAuthRetry((bearer) => apiRequest<Product>(`/admin/products/${id}`, { bearer }));
    } catch {
      return null;
    }
  }

  async create(input: ProductInput): Promise<Product> {
    return withAuthRetry((bearer) =>
      apiRequest<Product>('/admin/products', { method: 'POST', bearer, body: input }),
    );
  }

  async update(id: string, input: Partial<ProductInput>): Promise<Product> {
    return withAuthRetry((bearer) =>
      apiRequest<Product>(`/admin/products/${id}`, { method: 'PUT', bearer, body: input }),
    );
  }

  async remove(id: string): Promise<void> {
    await withAuthRetry((bearer) => apiRequest(`/admin/products/${id}`, { method: 'DELETE', bearer }));
  }

  async reorder(items: { id: string; menuOrder: number }[]): Promise<void> {
    await withAuthRetry((bearer) =>
      apiRequest('/admin/products/reorder', { method: 'POST', bearer, body: { items } }),
    );
  }
}
