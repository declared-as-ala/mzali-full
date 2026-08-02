import { Injectable } from '@nestjs/common';
import { resolveDateRange, DatePreset } from './dto/pos-analytics.dto';
import { PosAnalyticsFilter, PosAnalyticsService } from './pos-analytics.service';

export type PosDashboardSummary = {
  grossRevenueMinor: number;
  ticketCount: number;
  avgBasketMinor: number;
  productsSoldQty: number;
  cashMinor: number;
  cardMinor: number;
  mixedMinor: number;
};

export type PosDashboardTopProduct = {
  rank: number;
  productId: string;
  variantId: string | null;
  name: string;
  sku: string | null;
  imageUrl: string | null;
  qtySold: number;
  revenueMinor: number;
  boutiqueStock: number;
};

/**
 * POS-terminal-facing dashboard aggregation — a thin wrapper around
 * PosAnalyticsService (the admin-only pos-analytics-admin.controller.ts
 * stays untouched) so the till's home screen and the admin reports never
 * disagree on how a "completed sale" or "today" is defined.
 */
@Injectable()
export class PosDashboardService {
  constructor(private readonly analytics: PosAnalyticsService) {}

  async summary(locationId: string): Promise<PosDashboardSummary> {
    const { from, to } = resolveDateRange('today');
    const filter: PosAnalyticsFilter = { from, to, locationId };
    const raw = await this.analytics.kpiRaw(filter);
    return {
      grossRevenueMinor: raw.grossMinor,
      ticketCount: raw.ticketCount,
      avgBasketMinor: raw.avgBasketMinor,
      productsSoldQty: raw.itemsSold,
      cashMinor: raw.cashMinor,
      cardMinor: raw.cardMinor,
      mixedMinor: raw.mixedMinor,
    };
  }

  async topProducts(locationId: string, period: DatePreset): Promise<PosDashboardTopProduct[]> {
    const { from, to } = resolveDateRange(period === 'thisMonth' ? 'thisMonth' : period);
    const filter: PosAnalyticsFilter = { from, to, locationId };
    const rows = await this.analytics.topProducts(filter, { channel: 'pos', limit: 10 });
    return rows.map((r) => ({
      rank: r.rank,
      productId: r.productId,
      variantId: r.variantId,
      name: r.productName,
      sku: r.sku,
      imageUrl: r.imageUrl,
      qtySold: r.quantitySold,
      revenueMinor: Math.round(r.revenue * 1000),
      boutiqueStock: r.boutiqueStock,
    }));
  }
}
