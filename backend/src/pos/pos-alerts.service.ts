import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SettingsService } from '@/settings/settings.service';
import { Variant } from '@/catalog/variant.schema';
import { StockItem } from '@/inventory/stock-item.schema';
import { Employee } from '@/users/employee.schema';
import { PosCashierSession } from './pos-cashier-session.schema';
import { PosSale } from './pos-sale.schema';

export type PosAlertType =
  | 'LARGE_CASH_DIFFERENCE'
  | 'EXCESSIVE_DISCOUNT'
  | 'REPEATED_DISCOUNTS'
  | 'SALE_BELOW_COST'
  | 'LONG_OPEN_SESSION'
  | 'UNREVIEWED_CLOSED_SESSION'
  | 'NEGATIVE_STOCK';

export type PosAlert = {
  type: PosAlertType;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detectedAt: string;
  /** Links to the underlying records so a reviewer can inspect the raw
   *  evidence themselves — deliberately no verdict or blame is embedded
   *  here, only pointers to what to look at. */
  evidence: {
    sessionId?: string;
    saleId?: string;
    cashierId?: string;
    cashierName?: string;
    locationId?: string;
    variantId?: string;
    amountMinor?: number;
  };
  summary: string;
};

const UNREVIEWED_GRACE_HOURS = 12;

@Injectable()
export class PosAlertsService {
  constructor(
    @InjectModel(PosSale.name) private readonly sales: Model<PosSale>,
    @InjectModel(PosCashierSession.name) private readonly sessions: Model<PosCashierSession>,
    @InjectModel(StockItem.name) private readonly stockItems: Model<StockItem>,
    @InjectModel(Variant.name) private readonly variants: Model<Variant>,
    @InjectModel(Employee.name) private readonly employees: Model<Employee>,
    private readonly settings: SettingsService,
  ) {}

  /** Runs every configured detector over a lookback window and returns the
   *  merged, most-recent-first alert feed. Each detector is independent —
   *  one failing to find anything doesn't affect the others. */
  async detect(lookbackHours = 72): Promise<PosAlert[]> {
    const config = await this.settings.getPosAlertSettings();
    const since = new Date(Date.now() - lookbackHours * 3_600_000);

    const [cashDiff, discounts, belowCost, longOpen, unreviewed, negativeStock] = await Promise.all([
      this.largeCashDifferences(since, config.largeCashDifferenceMinor),
      this.discountAlerts(since, config.excessiveDiscountPercent, config.repeatedDiscountCountThreshold, config.repeatedDiscountWindowHours),
      config.belowCostAlertEnabled ? this.belowCostSales(since) : Promise.resolve([]),
      this.longOpenSessions(config.longOpenSessionHours),
      this.unreviewedClosedSessions(),
      this.negativeStock(),
    ]);

    return [...cashDiff, ...discounts, ...belowCost, ...longOpen, ...unreviewed, ...negativeStock].sort(
      (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
    );
  }

  private async cashierName(cashierId: string): Promise<string> {
    const doc = await this.employees.findById(cashierId).select({ name: 1 });
    return doc?.name ?? cashierId;
  }

  private async largeCashDifferences(since: Date, thresholdMinor: number): Promise<PosAlert[]> {
    const closedSessions = await this.sessions.find({ status: 'CLOSED', closedAt: { $gte: since } });
    const alerts: PosAlert[] = [];
    for (const s of closedSessions) {
      const zReport = s.reports.find((r) => r.type === 'Z');
      const diff = zReport?.cashDifferenceMinor;
      if (diff == null || Math.abs(diff) < thresholdMinor) continue;
      alerts.push({
        type: 'LARGE_CASH_DIFFERENCE',
        severity: Math.abs(diff) >= thresholdMinor * 2 ? 'critical' : 'warning',
        title: 'Écart de caisse important',
        detectedAt: (s.closedAt ?? new Date()).toISOString(),
        evidence: { sessionId: s.id, cashierId: s.cashierId, cashierName: await this.cashierName(s.cashierId), amountMinor: diff },
        summary: `Écart de ${(diff / 1000).toFixed(3)} DT constaté à la fermeture de la session — comptage à vérifier`,
      });
    }
    return alerts;
  }

  private async discountAlerts(
    since: Date,
    excessivePercent: number,
    repeatedCountThreshold: number,
    repeatedWindowHours: number,
  ): Promise<PosAlert[]> {
    const discountedSales = await this.sales.find({
      status: 'COMPLETED',
      createdAt: { $gte: since },
      discountMinor: { $gt: 0 },
    });

    const alerts: PosAlert[] = [];
    const byCashier = new Map<string, typeof discountedSales>();
    for (const sale of discountedSales) {
      const percent = sale.subtotalMinor > 0 ? (sale.discountMinor / sale.subtotalMinor) * 100 : 0;
      if (percent >= excessivePercent) {
        alerts.push({
          type: 'EXCESSIVE_DISCOUNT',
          severity: percent >= excessivePercent * 1.5 ? 'critical' : 'warning',
          title: 'Remise inhabituellement élevée',
          detectedAt: sale.createdAt.toISOString(),
          evidence: {
            saleId: sale.id, cashierId: sale.cashierId, cashierName: await this.cashierName(sale.cashierId),
            locationId: sale.locationId, amountMinor: sale.discountMinor,
          },
          summary: `Remise de ${Math.round(percent)}% sur la vente #${sale.saleNumber}`,
        });
      }
      const list = byCashier.get(sale.cashierId) ?? [];
      list.push(sale);
      byCashier.set(sale.cashierId, list);
    }

    for (const [cashierId, cashierSales] of byCashier) {
      const sorted = [...cashierSales].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      for (let i = 0; i < sorted.length; i++) {
        const windowEnd = sorted[i].createdAt.getTime();
        const windowStart = windowEnd - repeatedWindowHours * 3_600_000;
        const inWindow = sorted.filter((s) => s.createdAt.getTime() >= windowStart && s.createdAt.getTime() <= windowEnd);
        if (inWindow.length >= repeatedCountThreshold) {
          alerts.push({
            type: 'REPEATED_DISCOUNTS',
            severity: 'warning',
            title: 'Remises répétées par le même caissier',
            detectedAt: sorted[i].createdAt.toISOString(),
            evidence: { cashierId, cashierName: await this.cashierName(cashierId), saleId: sorted[i].id },
            summary: `${inWindow.length} ventes avec remise en ${repeatedWindowHours}h`,
          });
          break; // one alert per cashier per burst is enough signal, not one per sale in it
        }
      }
    }
    return alerts;
  }

  private async belowCostSales(since: Date): Promise<PosAlert[]> {
    const sales = await this.sales.find({ status: 'COMPLETED', createdAt: { $gte: since } });
    if (!sales.length) return [];
    const variantIds = [...new Set(sales.flatMap((s) => s.lines.map((l) => l.variantId)))];
    // Cost source is `variants.purchasePriceMinor` (admin-entered on the product
    // form) — same single source of truth as stats.service.ts's marginReport.
    const variantDocs = await this.variants.find({ _id: { $in: variantIds }, purchasePriceMinor: { $ne: null } }).select({ purchasePriceMinor: 1 });
    const costByVariant = new Map(variantDocs.map((d) => [d.id, d.purchasePriceMinor as number]));

    const alerts: PosAlert[] = [];
    for (const sale of sales) {
      for (const line of sale.lines) {
        const cost = costByVariant.get(line.variantId);
        if (cost == null) continue; // costUnknown — never assume below-cost when cost is unknown
        const netUnitPrice = line.unitPriceMinor - (line.discountMinor > 0 ? Math.round(line.discountMinor / Math.max(line.qty, 1)) : 0);
        if (netUnitPrice < cost) {
          alerts.push({
            type: 'SALE_BELOW_COST',
            severity: 'critical',
            title: 'Vente en dessous du coût',
            detectedAt: sale.createdAt.toISOString(),
            evidence: {
              saleId: sale.id, variantId: line.variantId, cashierId: sale.cashierId,
              cashierName: await this.cashierName(sale.cashierId), amountMinor: cost - netUnitPrice,
            },
            summary: `${line.descriptionSnapshot} vendu à ${(netUnitPrice / 1000).toFixed(3)} DT (coût ${(cost / 1000).toFixed(3)} DT)`,
          });
        }
      }
    }
    return alerts;
  }

  private async longOpenSessions(thresholdHours: number): Promise<PosAlert[]> {
    const openSessions = await this.sessions.find({ status: 'OPEN' });
    const now = Date.now();
    const alerts: PosAlert[] = [];
    for (const s of openSessions) {
      const hoursOpen = (now - s.openedAt.getTime()) / 3_600_000;
      if (hoursOpen < thresholdHours) continue;
      alerts.push({
        type: 'LONG_OPEN_SESSION',
        severity: hoursOpen >= thresholdHours * 1.5 ? 'critical' : 'warning',
        title: 'Session ouverte depuis longtemps',
        detectedAt: new Date().toISOString(),
        evidence: { sessionId: s.id, cashierId: s.cashierId, cashierName: await this.cashierName(s.cashierId) },
        summary: `Session ouverte depuis ${Math.round(hoursOpen)}h`,
      });
    }
    return alerts;
  }

  private async unreviewedClosedSessions(): Promise<PosAlert[]> {
    const cutoff = new Date(Date.now() - UNREVIEWED_GRACE_HOURS * 3_600_000);
    const closedSessions = await this.sessions.find({ status: 'CLOSED', reviewedAt: null, closedAt: { $lte: cutoff } });
    return Promise.all(
      closedSessions.map(async (s) => ({
        type: 'UNREVIEWED_CLOSED_SESSION' as const,
        severity: 'info' as const,
        title: 'Session fermée non vérifiée',
        detectedAt: (s.closedAt ?? new Date()).toISOString(),
        evidence: { sessionId: s.id, cashierId: s.cashierId, cashierName: await this.cashierName(s.cashierId) },
        summary: `Session fermée depuis plus de ${UNREVIEWED_GRACE_HOURS}h sans vérification par un responsable`,
      })),
    );
  }

  private async negativeStock(): Promise<PosAlert[]> {
    const docs = await this.stockItems.find({ locationId: 'BOUTIQUE', quantityOnHand: { $lt: 0 } });
    return docs.map((d) => ({
      type: 'NEGATIVE_STOCK' as const,
      severity: 'critical' as const,
      title: 'Stock boutique négatif',
      detectedAt: d.updatedAt.toISOString(),
      evidence: { variantId: d.variantId, locationId: d.locationId },
      summary: `Stock de ${d.quantityOnHand} unités en boutique`,
    }));
  }
}
