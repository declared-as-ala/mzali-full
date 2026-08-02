import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LoyaltyService } from '@/loyalty/loyalty.service';
import { toAccountContract } from '@/loyalty/loyalty.mapper';
import { PosSale } from './pos-sale.schema';

export type PosCustomerSummary = {
  customerId: string;
  customerName: string | null;
  loyaltyAccount: ReturnType<typeof toAccountContract> | null;
  /** POS-only — this is NOT Customer.totalSpentMinor (that field is
   *  populated by the online checkout flow and would silently mix
   *  channels if reused here). */
  totalSpentInStoreMinor: number;
  visitCount: number;
  lastVisitAt: string | null;
  purchaseHistory: {
    saleId: string;
    saleNumber: number;
    date: string;
    totalMinor: number;
    itemCount: number;
  }[];
  favoriteProducts: {
    productId: string;
    name: string;
    qtyPurchased: number;
  }[];
};

/**
 * POS-terminal-facing customer summary — separate from the admin
 * customer view, and deliberately computed from pos_sales directly
 * (not Customer.totalSpentMinor/ordersCount, which only reflect the
 * online checkout flow) so "total spent" here is real, boutique-only data.
 */
@Injectable()
export class PosCustomersService {
  constructor(
    @InjectModel(PosSale.name) private readonly sales: Model<PosSale>,
    private readonly loyalty: LoyaltyService,
  ) {}

  async summary(customerId: string): Promise<PosCustomerSummary> {
    const [account, customer, historyRows, totalsRow, favoriteRows] = await Promise.all([
      this.loyalty.getByCustomerId(customerId),
      this.loyalty.getCustomer(customerId),
      this.sales
        .find({ customerId, status: 'COMPLETED' })
        .sort({ createdAt: -1 })
        .limit(25)
        .select({ saleNumber: 1, totalMinor: 1, createdAt: 1, lines: 1 }),
      this.sales.aggregate<{ _id: null; totalMinor: number; visitCount: number; lastVisitAt: Date }>([
        { $match: { customerId, status: 'COMPLETED' } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: null, totalMinor: { $sum: '$totalMinor' }, visitCount: { $sum: 1 }, lastVisitAt: { $first: '$createdAt' } } },
      ]),
      this.sales.aggregate<{ _id: string; name: string; qty: number }>([
        { $match: { customerId, status: 'COMPLETED' } },
        { $unwind: '$lines' },
        {
          $group: {
            _id: '$lines.productId',
            name: { $first: '$lines.descriptionSnapshot' },
            qty: { $sum: '$lines.qty' },
          },
        },
        { $sort: { qty: -1 } },
        { $limit: 5 },
      ]),
    ]);

    const totals = totalsRow[0];

    return {
      customerId,
      customerName: customer ? `${customer.firstName} ${customer.lastName}`.trim() : null,
      loyaltyAccount: account ? toAccountContract(account, customer ?? undefined) : null,
      totalSpentInStoreMinor: totals?.totalMinor ?? 0,
      visitCount: totals?.visitCount ?? 0,
      lastVisitAt: totals?.lastVisitAt ? totals.lastVisitAt.toISOString() : null,
      purchaseHistory: historyRows.map((s) => ({
        saleId: s.id,
        saleNumber: s.saleNumber,
        date: s.createdAt.toISOString(),
        totalMinor: s.totalMinor,
        itemCount: s.lines.reduce((n, l) => n + l.qty, 0),
      })),
      favoriteProducts: favoriteRows.map((r) => ({ productId: r._id, name: r.name, qtyPurchased: r.qty })),
    };
  }
}
