import type { LoyaltySettings } from '@contracts';
import { LoyaltyRulesService } from './loyalty-rules.service';

const BASE_RULES: LoyaltySettings = {
  pointsPerDinarSpent: 1,
  minimumPurchaseMinor: 0,
  bonusCategories: [],
  bonusProducts: [],
  birthdayBonusPoints: 0,
  newCustomerBonusPoints: 0,
  earnOnOrderStatus: 'confirme',
  excludeShippingFromEarning: true,
  excludedProductIds: [],
  pointValueMinor: 10,
  maxRedemptionPercentOfSale: 50,
  minimumPointsToRedeem: 100,
  managerApprovalAboveMinor: 10000,
  allowMultipleCardsPerCustomer: false,
};

describe('LoyaltyRulesService.calculateEarnedPointsWithRules', () => {
  const service = new LoyaltyRulesService(undefined as never);

  it('earns pointsPerDinarSpent points per dinar of eligible spend', () => {
    const points = service.calculateEarnedPointsWithRules(
      { lines: [{ productId: 'p1', categoryIds: [], totalMinor: 25000 }], shippingMinor: 0 },
      BASE_RULES,
    );
    expect(points).toBe(25); // 25.000 DT * 1 point/DT
  });

  it('excludes configured product ids entirely', () => {
    const points = service.calculateEarnedPointsWithRules(
      {
        lines: [
          { productId: 'excluded', categoryIds: [], totalMinor: 50000 },
          { productId: 'ok', categoryIds: [], totalMinor: 10000 },
        ],
        shippingMinor: 0,
      },
      { ...BASE_RULES, excludedProductIds: ['excluded'] },
    );
    expect(points).toBe(10);
  });

  it('applies a bonus category multiplier', () => {
    const points = service.calculateEarnedPointsWithRules(
      { lines: [{ productId: 'p1', categoryIds: ['cat-vip'], totalMinor: 10000 }], shippingMinor: 0 },
      { ...BASE_RULES, bonusCategories: [{ categoryId: 'cat-vip', multiplier: 2 }] },
    );
    expect(points).toBe(20); // 10 DT * 2x multiplier
  });

  it('a product-specific multiplier takes precedence over a category multiplier', () => {
    const points = service.calculateEarnedPointsWithRules(
      { lines: [{ productId: 'p1', categoryIds: ['cat-vip'], totalMinor: 10000 }], shippingMinor: 0 },
      {
        ...BASE_RULES,
        bonusCategories: [{ categoryId: 'cat-vip', multiplier: 2 }],
        bonusProducts: [{ productId: 'p1', multiplier: 3 }],
      },
    );
    expect(points).toBe(30);
  });

  it('returns 0 when the purchase is below minimumPurchaseMinor', () => {
    const points = service.calculateEarnedPointsWithRules(
      { lines: [{ productId: 'p1', categoryIds: [], totalMinor: 5000 }], shippingMinor: 0 },
      { ...BASE_RULES, minimumPurchaseMinor: 10000 },
    );
    expect(points).toBe(0);
  });

  it('excludes shipping from the earning basis when configured', () => {
    const points = service.calculateEarnedPointsWithRules(
      { lines: [{ productId: 'p1', categoryIds: [], totalMinor: 10000 }], shippingMinor: 5000 },
      { ...BASE_RULES, excludeShippingFromEarning: true },
    );
    expect(points).toBe(10);
  });

  it('includes shipping in the earning basis when not excluded', () => {
    const points = service.calculateEarnedPointsWithRules(
      { lines: [{ productId: 'p1', categoryIds: [], totalMinor: 10000 }], shippingMinor: 5000 },
      { ...BASE_RULES, excludeShippingFromEarning: false },
    );
    expect(points).toBe(15);
  });
});

describe('LoyaltyRulesService.pointsToDiscountMinor', () => {
  const service = new LoyaltyRulesService(undefined as never);

  it('converts points to millimes using pointValueMinor', () => {
    expect(service.pointsToDiscountMinor(150, BASE_RULES)).toBe(1500);
  });
});
