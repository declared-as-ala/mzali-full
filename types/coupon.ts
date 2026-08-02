// Admin-only type for the new coupons feature (mzali-api provider only).
// Not part of the types/index barrel — imported directly where needed so it
// stays clearly separated from the WooCommerce-era storefront contract.
export type CouponType = 'percent' | 'fixed';

export type Coupon = {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  minSubtotal: number | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  usageCount: number;
  perPhoneLimit: number | null;
  active: boolean;
  appliesTo: { kind: 'all' | 'categories' | 'products'; ids: string[] };
  createdAt: string;
  updatedAt: string;
};
