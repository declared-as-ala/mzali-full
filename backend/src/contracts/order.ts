import type { CartItem } from './cart';

export type CheckoutCustomer = {
  firstName: string;
  lastName?: string;
  phone: string;
  phone2?: string;
  email?: string;
  city: string;
  address: string;
  note?: string;
};

export type CheckoutPayload = {
  customer: CheckoutCustomer;
  items: CartItem[];
  shipping: number;     // delivery cost
  subtotal?: number;
  total?: number;
  deliveryCompany?: string;
  paymentMethod?: 'cod' | 'card';
  source?: string;      // utm/source for analytics
  status?: string;      // optional status
  attempts?: number;    // number of call attempts
  couponCode?: string;  // additive — only applied by the mzali-api provider
};

// Standard WooCommerce statuses + any custom slug (e.g. Tunisian COD plugins:
// "en-attente", "confirme", "annule", "tentative", "auto-draft", "checkout-draft", etc.)
export type StandardOrderStatus =
  | 'pending'
  | 'processing'
  | 'on-hold'
  | 'completed'
  | 'cancelled'
  | 'refunded'
  | 'failed';
export type OrderStatus = StandardOrderStatus | (string & {});

export type OrderLineItem = {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
  imageUrl?: string;
  attributes?: { key: string; value: string }[];   // variation / bundle slot info shown in admin
};

export type OrderResponse = {
  id: string;
  number: string;
  status: OrderStatus;
  currency: string;
  total: number;
  createdAt: string;       // ISO
  confirmedAt?: string | null;  // ISO date/time of confirmation
  /** Last write timestamp — basis for optimistic concurrency on edits. */
  updatedAt?: string;      // ISO
  /** Optimistic-concurrency counter bumped by the backend on every
   *  admin/employee write; echoed back on update to detect concurrent edits. */
  version?: number;
  customer: CheckoutCustomer;
  items: OrderLineItem[];
  shipping: number;
  meta?: Record<string, unknown>;
};

/**
 * Single-round-trip status breakdown for the admin/employee orders list —
 * see OrdersService.counts(). `total` is the "Normal" tab total (pending +
 * confirmed + every tentative attempt + cancelled), matching the tab split
 * already used elsewhere; abandoned/trash are separate buckets on purpose.
 */
export type OrderStatusCounts = {
  total: number;
  pending: number;
  confirmed: number;
  attempts: {
    total: number;
    attempt1: number;
    attempt2: number;
    attempt3: number;
    attempt4: number;
    attempt5: number;
  };
  cancelled: number;
  abandoned: number;
  trash: number;
};
