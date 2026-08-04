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
  customer: CheckoutCustomer;
  items: OrderLineItem[];
  shipping: number;
  meta?: Record<string, unknown>;
};
