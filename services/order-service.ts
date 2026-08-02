import type { CheckoutPayload, OrderResponse, OrderStatus } from '@/types';

export type OrderListQuery = {
  page?: number;
  perPage?: number;
  status?: OrderStatus | 'any';
  search?: string;
  after?: string;
  before?: string;
  assignedEmployeeId?: string | 'any' | 'unassigned';
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
};

export interface OrderService {
  create(payload: CheckoutPayload): Promise<OrderResponse>;
  getById(id: string): Promise<OrderResponse | null>;
  list(query?: OrderListQuery): Promise<OrderListResult>;
  update(id: string, patch: OrderUpdate): Promise<OrderResponse>;
  remove(id: string): Promise<void>;
  /** Assign or reassign an order to an employee (pass null to unassign). */
  assignEmployee(orderId: string, employeeId: string | null, assignedBy?: 'auto' | 'admin'): Promise<OrderResponse>;
}
