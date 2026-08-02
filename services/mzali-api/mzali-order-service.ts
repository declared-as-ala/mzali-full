import { randomUUID } from 'node:crypto';
import type { CheckoutPayload, OrderResponse } from '@/types';
import type { OrderListQuery, OrderListResult, OrderService, OrderUpdate } from '../order-service';
import { apiRequest } from './client';
import { getValidAccessToken } from '@/lib/api-auth';

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
    const bearer = await getValidAccessToken();
    return apiRequest<OrderListResult>('/admin/orders', {
      bearer: bearer ?? undefined,
      query: {
        page: query.page,
        perPage: query.perPage,
        status: query.status,
        search: query.search,
        after: query.after,
        before: query.before,
        assignedEmployeeId: query.assignedEmployeeId,
      },
    });
  }

  async update(id: string, patch: OrderUpdate): Promise<OrderResponse> {
    const bearer = await getValidAccessToken();
    return apiRequest<OrderResponse>(`/admin/orders/${id}`, {
      method: 'PUT',
      bearer: bearer ?? undefined,
      body: patch,
    });
  }

  async remove(id: string): Promise<void> {
    const bearer = await getValidAccessToken();
    await apiRequest(`/admin/orders/${id}`, { method: 'DELETE', bearer: bearer ?? undefined });
  }

  async assignEmployee(orderId: string, employeeId: string | null, assignedBy: 'auto' | 'admin' = 'admin'): Promise<OrderResponse> {
    void assignedBy; // the backend always records 'admin' for manually-triggered assigns from this endpoint
    const bearer = await getValidAccessToken();
    return apiRequest<OrderResponse>(`/admin/orders/${orderId}/assign`, {
      method: 'POST',
      bearer: bearer ?? undefined,
      body: { employeeId },
    });
  }
}
