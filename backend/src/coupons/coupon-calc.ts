import type { CouponType } from '@contracts';
import { clampDiscount, percentOfMinor } from '@/common/money';

export type CouponSnapshot = {
  code: string;
  type: CouponType;
  value: number;
  minSubtotalMinor: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  usageCount: number;
  perPhoneLimit: number | null;
  active: boolean;
};

export type CouponEvalContext = {
  /** The subtotal the discount applies against (full cart, or only the
   *  eligible items when appliesTo restricts to categories/products). */
  eligibleSubtotalMinor: number;
  now: Date;
  /** How many times this phone number has already redeemed this coupon. */
  phoneRedemptionCount: number;
};

export type CouponEvalResult =
  | { valid: true; discountMinor: number }
  | { valid: false; reason: string };

/**
 * Pure evaluation of a coupon against a cart — no I/O. The caller is
 * responsible for loading the coupon and computing phoneRedemptionCount.
 */
export function evaluateCoupon(coupon: CouponSnapshot, ctx: CouponEvalContext): CouponEvalResult {
  if (!coupon.active) return { valid: false, reason: 'Ce code promo n\'est plus actif' };
  if (coupon.startsAt && ctx.now < coupon.startsAt) return { valid: false, reason: 'Ce code promo n\'est pas encore actif' };
  if (coupon.endsAt && ctx.now > coupon.endsAt) return { valid: false, reason: 'Ce code promo a expiré' };
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    return { valid: false, reason: 'Ce code promo a atteint sa limite d\'utilisation' };
  }
  if (coupon.perPhoneLimit !== null && ctx.phoneRedemptionCount >= coupon.perPhoneLimit) {
    return { valid: false, reason: 'Vous avez déjà utilisé ce code promo' };
  }
  if (coupon.minSubtotalMinor !== null && ctx.eligibleSubtotalMinor < coupon.minSubtotalMinor) {
    return { valid: false, reason: 'Montant minimum non atteint pour ce code promo' };
  }
  if (ctx.eligibleSubtotalMinor <= 0) return { valid: false, reason: 'Aucun article éligible pour ce code promo' };

  const rawDiscount =
    coupon.type === 'percent'
      ? percentOfMinor(ctx.eligibleSubtotalMinor, coupon.value)
      : coupon.value;
  const discountMinor = clampDiscount(rawDiscount, ctx.eligibleSubtotalMinor);
  return { valid: true, discountMinor };
}
