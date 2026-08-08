import { randomUUID } from 'node:crypto';
import type { CheckoutPayload, OrderResponse, OrderStatusCounts } from '@/types';
import type { OrderCountsQuery, OrderListQuery, OrderListResult, OrderService, OrderUpdate } from '../order-service';
import { apiRequest } from './client';
import { withAuthRetry } from './with-auth-retry';

/**
 * Admin/employee edit flows only — checkout create/draft-upsert is handled
 * directly by app/api/orders/route.ts against the dedicated public
 * /orders and /orders/:id/draft endpoints (see that file for why: the
 * generic OrderService.update() signature can't tell a guest checkout
 * draft-save apart from an authenticated admin edit, and they hit
 * different backend endpoints with different auth).
 */
export class MzaliApiOrderService implements OrderService {
  async create(payload: CheckoutPayload): Promise<OrderResponse> {
    return apiRequest<OrderResponse>('/orders', {
      method: 'POST',
      serviceToken: true,
      idempotencyKey: randomUUID(),
      body: payload,
    });
  }

  async getById(id: string): Promise<OrderResponse | null> {
    try {
      return await apiRequest<OrderResponse>(`/orders/${id}`, { serviceToken: true });
    } catch {
      return null;
    }
  }

  async list(query: OrderListQuery = {}): Promise<OrderListResult> {
    return withAuthRetry((bearer) =>
      apiRequest<OrderListResult>('/admin/orders', {
        bearer,
        query: {
          page: query.page,
          perPage: query.perPage,
          status: query.status,
          search: query.search,
          after: query.after,
          before: query.before,
        },
      }),
    );
  }

  async counts(query: OrderCountsQuery = {}): Promise<OrderStatusCounts> {
    return withAuthRetry((bearer) =>
      apiRequest<OrderStatusCounts>('/admin/orders/counts', {
        bearer,
        query: { search: query.search, after: query.after, before: query.before },
      }),
    );
  }

  async update(id: string, patch: OrderUpdate): Promise<OrderResponse> {
    return withAuthRetry((bearer) =>
      apiRequest<OrderResponse>(`/admin/orders/${id}`, { method: 'PUT', bearer, body: patch }),
    );
  }

  async remove(id: string): Promise<void> {
    await withAuthRetry((bearer) => apiRequest(`/admin/orders/${id}`, { method: 'DELETE', bearer }));
  }
}
