export type DashboardStats = {
  revenue: { today: number; last7Days: number; last30Days: number };
  orders: { today: number; last7Days: number; last30Days: number; total: number };
  averageOrderValue: number;
  statusMix: Record<string, number>;
  topProducts: { productId: string; name: string; quantity: number; revenue: number }[];
  lowStock: { productId: string; name: string; locationId: string; available: number; threshold: number }[];
  period: {
    days: number;
    revenue: number;
    orders: number;
    averageOrderValue: number;
    newCustomers: number;
    repeatCustomerRate: number;
    cancelledRate: number;
    abandonedCarts: number;
    exchangeRate: number;
  };
  previousPeriod: { revenue: number; orders: number };
  generatedAt: string;
};

export type RevenueSeriesPoint = { date: string; revenue: number; orders: number };
export type StatusFunnelPoint = { status: string; count: number };
export type CarrierPerformance = {
  carrier: 'navex' | 'firstdelivery' | 'axess';
  pushed: number;
  sent: number;
  failed: number;
  successRate: number;
  averagePushMinutes: number | null;
  recentFailures: { orderId: string; orderNumber: number; error: string | null; pushedAt: string }[];
};
export type CouponPerformance = {
  couponId: string;
  code: string;
  usageCount: number;
  usageLimit: number | null;
  totalDiscount: number;
};
export type GeographyPerformance = { city: string; orders: number; revenue: number };

export type PosDailyPoint = {
  date: string;
  revenue: number;
  discounts: number;
  transactionCount: number;
  averageBasket: number;
  cashRevenue: number;
  cardRevenue: number;
  otherRevenue: number;
};

export type PosCashierPerformance = {
  cashierId: string;
  name: string;
  revenue: number;
  transactionCount: number;
  averageBasket: number;
};
