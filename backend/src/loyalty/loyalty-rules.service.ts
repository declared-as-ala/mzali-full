import { Injectable } from '@nestjs/common';
import type { LoyaltySettings } from '@contracts';
import { SettingsService } from '@/settings/settings.service';

export type EarningLineInput = {
  productId: string;
  categoryIds: string[];
  totalMinor: number;
};

export type EarningCalcInput = {
  lines: EarningLineInput[];
  shippingMinor: number;
};

/**
 * Pure earning-calculation logic, shared by the POS sale hook and the
 * online order-status hook — never duplicated between the two. Settings
 * are read fresh on every call so a mid-day rule change takes effect
 * immediately (no caching).
 */
@Injectable()
export class LoyaltyRulesService {
  constructor(private readonly settings: SettingsService) {}

  async calculateEarnedPoints(input: EarningCalcInput): Promise<number> {
    const rules = await this.settings.getLoyaltySettings();
    return this.calculateEarnedPointsWithRules(input, rules);
  }

  calculateEarnedPointsWithRules(input: EarningCalcInput, rules: LoyaltySettings): number {
    const excluded = new Set(rules.excludedProductIds);
    const bonusByCategory = new Map(rules.bonusCategories.map((b) => [b.categoryId, b.multiplier]));
    const bonusByProduct = new Map(rules.bonusProducts.map((b) => [b.productId, b.multiplier]));

    let eligibleMinor = 0;
    for (const line of input.lines) {
      if (excluded.has(line.productId)) continue;
      const productMultiplier = bonusByProduct.get(line.productId);
      const categoryMultiplier = line.categoryIds
        .map((id) => bonusByCategory.get(id))
        .find((m): m is number => m !== undefined);
      const multiplier = productMultiplier ?? categoryMultiplier ?? 1;
      eligibleMinor += line.totalMinor * multiplier;
    }
    if (!rules.excludeShippingFromEarning) {
      eligibleMinor += input.shippingMinor;
    }

    const purchaseMinor = input.lines.reduce((sum, l) => sum + l.totalMinor, 0) + input.shippingMinor;
    if (purchaseMinor < rules.minimumPurchaseMinor) return 0;

    return Math.floor((eligibleMinor / 1000) * rules.pointsPerDinarSpent);
  }

  /** Discount value (millimes) a given point count converts to. */
  pointsToDiscountMinor(points: number, rules: LoyaltySettings): number {
    return points * rules.pointValueMinor;
  }
}
