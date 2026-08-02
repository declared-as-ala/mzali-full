// Backend-only contract (not mirrored from frontend types/).

export type CouponType = 'percent' | 'fixed';

export type Coupon = {
  id: string;
  code: string;                  // stored uppercase, unique
  type: CouponType;
  /** percent: integer 1–100; fixed: amount in dinars (float, converted to millimes server-side) */
  value: number;
  minSubtotal: number | null;    // dinars
  startsAt: string | null;       // ISO
  endsAt: string | null;         // ISO
  usageLimit: number | null;
  usageCount: number;
  perPhoneLimit: number | null;
  active: boolean;
  appliesTo: { kind: 'all' | 'categories' | 'products'; ids: string[] };
  createdAt: string;
  updatedAt: string;
};

export type CouponInput = {
  code: string;
  type: CouponType;
  value: number;
  minSubtotal?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  usageLimit?: number | null;
  perPhoneLimit?: number | null;
  active?: boolean;
  appliesTo?: { kind: 'all' | 'categories' | 'products'; ids: string[] };
};

/** Result of validating a coupon against a cart before checkout. */
export type CouponValidation =
  | { valid: true; code: string; type: CouponType; value: number; discount: number }
  | { valid: false; reason: string };
