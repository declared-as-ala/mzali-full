import type { CheckoutPayload, OrderResponse, OrderStatus, OrderStatusCounts } from '@/types';

export type OrderListQuery = {
  page?: number;
  perPage?: number;
  status?: OrderStatus | 'any';
  search?: string;
  after?: string;
  before?: string;
};

export type OrderCountsQuery = {
  search?: string;
  after?: string;
  before?: string;
};

export type OrderListResult = {
  items: OrderResponse[];
  total: number;
  totalPages: number;
  page: number;
};

export type OrderUpdate = {
  status?: OrderStatus;
  customer?: Partial<CheckoutPayload['customer']>;
  shipping?: number;
  deliveryCompany?: string;
  exchange?: boolean;
  privateNote?: string;
  subtotal?: number;
  total?: number;
  attempts?: number;
  items?: {
    productId: string;
    qty: number;
    unitPrice?: number;
    variation?: Record<string, string>;
    bundleName?: string;
    bundleSlot?: number;
  }[];
  /** Required by the backend when editing an order that's already
   *  confirmed (stock has physically moved) — see OrdersService.update(). */
  reason?: string;
  /** Optimistic concurrency: the version the editor loaded (OrderResponse
   *  .version). A mismatch with the persisted version aborts with 409. */
  version?: number;
};

export interface OrderService {
  create(payload: CheckoutPayload): Promise<OrderResponse>;
  getById(id: string): Promise<OrderResponse | null>;
  list(query?: OrderListQuery): Promise<OrderListResult>;
  /** One-round-trip status breakdown for the orders list header/filters —
   *  see backend OrdersService.counts(). Same search/date scope as list(). */
  counts(query?: OrderCountsQuery): Promise<OrderStatusCounts>;
  update(id: string, patch: OrderUpdate): Promise<OrderResponse>;
  remove(id: string): Promise<void>;
}
