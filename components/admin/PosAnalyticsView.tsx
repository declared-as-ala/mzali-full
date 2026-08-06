'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Award, BarChart3, Boxes, CreditCard, Download, Gift, Package,
  RefreshCw, ShieldAlert, TrendingDown, TrendingUp, Truck, Users, Wallet, X,
} from 'lucide-react';
import {
  Bar, CartesianGrid, Cell, ComposedChart, Legend, Line,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { formatPrice, formatDateTime } from '@/lib/site-config';
import { useAdminHref } from '@/lib/admin-nav-context';
import { useToast } from './Toast';

// ---------------------------------------------------------------------------
// Types (hand-kept in sync with backend/src/pos/pos-analytics.service.ts and
// pos-alerts.service.ts — these two services have no @contracts mirror yet,
// same convention as pos/types/pos.ts for the POS app).
// ---------------------------------------------------------------------------

type DatePreset = 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'custom';

type KpiField = { label: string; value: number | null; previousValue?: number; changePercent?: number | null; note?: string };
type Kpis = {
  grossRevenue: KpiField; netRevenue: KpiField; totalDiscounts: KpiField; totalRefunds: KpiField;
  completedTickets: KpiField; cancelledSales: KpiField; refundedTickets: KpiField; productsSold: KpiField;
  uniqueCustomers: KpiField; averageBasket: KpiField; averageArticlesPerTicket: KpiField;
  cashRevenue: KpiField; cardRevenue: KpiField; mixedRevenue: KpiField;
  loyaltyPointsEarned: KpiField; loyaltyPointsRedeemed: KpiField;
  openSessions: KpiField; cashDifference: KpiField; taxTotal: KpiField;
};

type Margin = { revenue: number | null; cost: number | null; margin: number | null; marginPercent: number | null; costUnknown: boolean; hidden?: boolean };

type RevenuePoint = { bucket: string; revenue: number; discounts: number; tickets: number; averageBasket: number };
type RevenueSeries = { granularity: 'hour' | 'day' | 'week' | 'month'; points: RevenuePoint[] };

type PaymentBreakdownRow = { method: string; total: number; count: number; percentOfRevenue: number; averageValue: number; refundTotal: number };

type CashierPerformanceRow = {
  cashierId: string; cashierName: string; sessionCount: number; ticketCount: number; grossRevenue: number; netRevenue: number;
  averageBasket: number; itemsSold: number; discountsGranted: number; refundsProcessed: number; cancelledSales: number;
  manualPriceOverrides: number; cashDrawerManualOpenings: number; cashDifference: number; averageSessionDurationMinutes: number | null;
  lastActivityAt: string;
};

type CashierDetailSale = { id: string; saleNumber: number; totalMinor: number; discountMinor: number; status: string; paymentMethod: string | null; createdAt: string };
type CashierDetailSession = { id: string; status: 'OPEN' | 'CLOSED'; openedAt: string; closedAt: string | null; grossSalesMinor: number; transactionCount: number };
type CashierDetailCashMovement = { id: string; type: string; amountMinor: number; reason: string | null; createdAt: string };
type CashierDetail = { sales: CashierDetailSale[]; sessions: CashierDetailSession[]; cashMovements: CashierDetailCashMovement[] };

type SalesChannel = 'pos' | 'online' | 'all';
type ProductSort = 'qty' | 'revenue' | 'profit' | 'margin' | 'growth';

type ProductPerformanceRow = {
  rank: number; variantId: string | null; productId: string; productName: string; sku: string | null;
  imageUrl: string | null; categoryIds: string[]; quantitySold: number; transactionCount: number;
  revenue: number; discounts: number; cost: number | null; costUnknown?: boolean; profit: number | null; marginPercent: number | null;
  boutiqueStock: number; depotStock: number; incomingQty: number; averageSellingPrice: number; daysOfStockRemaining: number | null;
  trend: { quantityChangePercent: number | null; revenueChangePercent: number | null };
};
type CategoryPerformanceRow = {
  categoryId: string; categoryName: string; quantitySold: number; revenue: number;
  cost: number | null; costUnknown?: boolean; profit: number | null; marginPercent: number | null;
  percentOfRevenue: number; bestSellingProduct: string | null;
};

type LoyaltyAnalytics = {
  identifiedCustomerSales: number; anonymousSales: number; identifiedTicketCount: number; anonymousTicketCount: number;
  cardsIssued: number; cardsActive: number; cardsSuspended: number; cardsUnassigned: number; totalAccounts: number;
  pointsEarned: number; pointsRedeemed: number; unusedPointsLiability: number;
};

type LiveSession = {
  sessionId: string; cashierId: string; cashierName: string; terminalId: string; registerId: string | null;
  openedAt: string; revenue: number; transactionCount: number; cashTotal: number; cardTotal: number;
};

type AlertSeverity = 'info' | 'warning' | 'critical';
type PosAlert = {
  type: string; severity: AlertSeverity; title: string; detectedAt: string;
  evidence: { sessionId?: string; saleId?: string; cashierId?: string; cashierName?: string; locationId?: string; variantId?: string; amountMinor?: number };
  summary: string;
};

type Terminal = { id: string; name: string; locationId: string; registerId: string | null; active: boolean };
type Category = { id: string; name: string };

const PRESET_LABEL: Record<DatePreset, string> = {
  today: "Aujourd'hui", yesterday: 'Hier', last7: '7 jours', last30: '30 jours',
  thisMonth: 'Ce mois', lastMonth: 'Mois dernier', custom: 'Personnalisé',
};
const METHOD_LABEL: Record<string, string> = { CASH: 'Espèces', CARD: 'Carte', BANK_TRANSFER: 'Virement', MIXED_COMPONENT: 'Mixte', OTHER: 'Autre' };
const CHART_COLORS = ['#1325c4', '#ab93f4', '#22bf59', '#f59e0b', '#e11d48', '#0e55fb'];

function formatMinor(minor: number): string {
  return `${(minor / 1000).toFixed(3)} DT`;
}

// ---------------------------------------------------------------------------
// Filter state + query string
// ---------------------------------------------------------------------------

type Filter = { preset: DatePreset; from: string; to: string; locationId: string; terminalId: string; registerId: string; cashierId: string };

const DEFAULT_FILTER: Filter = { preset: 'today', from: '', to: '', locationId: '', terminalId: '', registerId: '', cashierId: '' };

function buildQuery(filter: Filter): string {
  const params = new URLSearchParams();
  params.set('preset', filter.preset);
  if (filter.preset === 'custom') {
    if (filter.from) params.set('from', `${filter.from}T00:00:00`);
    if (filter.to) params.set('to', `${filter.to}T23:59:59`);
  }
  if (filter.locationId) params.set('locationId', filter.locationId);
  if (filter.terminalId) params.set('terminalId', filter.terminalId);
  if (filter.registerId) params.set('registerId', filter.registerId);
  if (filter.cashierId) params.set('cashierId', filter.cashierId);
  return params.toString();
}

// ---------------------------------------------------------------------------
// Generic report-fetching hook (mirrors DashboardCommandCenter's useReport)
// ---------------------------------------------------------------------------

type LoadState<T> = { data: T | null; loading: boolean; error: string | null };

function useAnalyticsReport<T>(report: string, query: string, extra = ''): LoadState<T> & { retry: () => void } {
  const [state, setState] = useState<LoadState<T>>({ data: null, loading: true, error: null });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((v) => v + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: null }));
    const qs = extra ? `${query}&${extra}` : query;
    fetch(`/api/admin/pos/analytics/${report}?${qs}`, { cache: 'no-store', signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error('Impossible de charger ces données.');
        return res.json() as Promise<T>;
      })
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState((current) => ({ data: current.data, loading: false, error: error instanceof Error ? error.message : 'Données indisponibles.' }));
      });
    return () => controller.abort();
  }, [report, query, extra, attempt]);

  return { ...state, retry };
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function PosAnalyticsView() {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>(DEFAULT_FILTER);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [productChannel, setProductChannel] = useState<SalesChannel>('all');
  const [productSort, setProductSort] = useState<ProductSort>('qty');
  const [productCategoryId, setProductCategoryId] = useState('');
  const [categoryChannel, setCategoryChannel] = useState<SalesChannel>('all');
  const [cashierDrill, setCashierDrill] = useState<CashierPerformanceRow | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const query = useMemo(() => buildQuery(filter), [filter]);

  useEffect(() => {
    fetch('/api/admin/pos/terminals', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])).then(setTerminals).catch(() => {});
    fetch('/api/admin/categories', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])).then(setCategories).catch(() => {});
  }, []);

  const kpis = useAnalyticsReport<Kpis>('kpis', query);
  const margin = useAnalyticsReport<Margin>('margin', query);
  const revenue = useAnalyticsReport<RevenueSeries>('revenue-series', query);
  const paymentBreakdown = useAnalyticsReport<PaymentBreakdownRow[]>('payment-breakdown', query);
  const cashiers = useAnalyticsReport<CashierPerformanceRow[]>('cashiers', query);
  const productsExtra = useMemo(() => {
    const params = new URLSearchParams({ channel: productChannel, sort: productSort });
    if (productCategoryId) params.set('categoryId', productCategoryId);
    return params.toString();
  }, [productChannel, productSort, productCategoryId]);
  const products = useAnalyticsReport<ProductPerformanceRow[]>('products', query, productsExtra);
  const categoryPerf = useAnalyticsReport<CategoryPerformanceRow[]>('categories', query, `channel=${categoryChannel}`);
  const loyalty = useAnalyticsReport<LoyaltyAnalytics>('loyalty', query);

  const locationOptions = useMemo(() => [...new Set(terminals.map((t) => t.locationId))], [terminals]);
  const cashierOptions = useMemo(() => cashiers.data ?? [], [cashiers.data]);

  async function exportReport(report: string, format: 'csv' | 'xlsx' | 'pdf') {
    setExporting(`${report}-${format}`);
    try {
      const params = new URLSearchParams(query);
      params.set('report', report);
      params.set('format', format);
      const res = await fetch('/api/admin/pos/analytics/export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(params)),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.downloadUrl) { toast.error(data?.error ?? "Échec de l'export"); return; }
      window.open(data.downloadUrl, '_blank');
      toast.success('Export généré');
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">Analytique POS</h1>
          <p className="text-ink-700">Ventes en boutique, performance des caissiers et alertes opérationnelles.</p>
        </div>
        <ExportBar exporting={exporting} onExport={exportReport} />
      </header>

      <FilterBar filter={filter} onChange={setFilter} terminals={terminals} locationOptions={locationOptions} cashierOptions={cashierOptions} />

      <KpiGrid state={kpis} margin={margin} />

      <div className="mt-6 grid gap-6 xl:grid-cols-12">
        <Panel className="xl:col-span-8" title="Chiffre d'affaires" eyebrow={`Tendance · ${PRESET_LABEL[filter.preset]}`}>
          <ReportState state={revenue} minHeight="h-80">
            {(data) => <RevenueChart data={data} />}
          </ReportState>
        </Panel>

        <Panel className="xl:col-span-4" title="Moyens de paiement" eyebrow="Répartition, sans double comptage">
          <ReportState state={paymentBreakdown} minHeight="h-80">
            {(data) => <PaymentBreakdownPanel data={data} />}
          </ReportState>
        </Panel>

        <Panel className="xl:col-span-12" title="Performance des caissiers" eyebrow="Contrôle opérationnel — cliquer pour le détail">
          <ReportState state={cashiers} minHeight="h-64">
            {(data) => <CashierTable data={data} onOpen={setCashierDrill} />}
          </ReportState>
        </Panel>

        <TopProductsSection
          className="xl:col-span-12"
          state={products}
          channel={productChannel} onChannelChange={setProductChannel}
          sort={productSort} onSortChange={setProductSort}
          categoryId={productCategoryId} onCategoryIdChange={setProductCategoryId}
          categories={categories}
        />

        <TopCategoriesSection
          className="xl:col-span-12"
          state={categoryPerf}
          channel={categoryChannel} onChannelChange={setCategoryChannel}
        />

        <Panel className="xl:col-span-12" title="Fidélité" eyebrow="Cartes, points et ventes identifiées">
          <ReportState state={loyalty} minHeight="h-48">
            {(data) => <LoyaltyPanel data={data} />}
          </ReportState>
        </Panel>

        <LiveActivityPanel />
        <AlertsPanel />
        <LostSalesPanel query={query} />
      </div>

      {cashierDrill && <CashierDrawer cashier={cashierDrill} query={query} onClose={() => setCashierDrill(null)} />}
    </div>
  );
}

function ExportBar({ exporting, onExport }: { exporting: string | null; onExport: (report: string, format: 'csv' | 'xlsx' | 'pdf') => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="btn-primary inline-flex items-center gap-2">
        <Download size={15} /> Exporter
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-2xl bg-white p-2 shadow-card" onMouseLeave={() => setOpen(false)}>
          {(['kpis', 'revenue-series', 'cashiers', 'products', 'categories', 'payment-breakdown'] as const).map((report) => (
            <div key={report} className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 hover:bg-ink-100">
              <span className="text-xs font-bold text-ink-900">{REPORT_EXPORT_LABEL[report]}</span>
              <div className="flex gap-1">
                {(['csv', 'xlsx', 'pdf'] as const).map((format) => (
                  <button
                    key={format}
                    disabled={exporting === `${report}-${format}`}
                    onClick={() => onExport(report, format)}
                    className="rounded-md border border-ink-200 px-1.5 py-0.5 text-[10px] font-black uppercase text-ink-700 hover:bg-ink-200 disabled:opacity-40"
                  >
                    {format}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const REPORT_EXPORT_LABEL: Record<string, string> = {
  kpis: 'Indicateurs', 'revenue-series': 'Revenus', cashiers: 'Caissiers', products: 'Produits', categories: 'Catégories', 'payment-breakdown': 'Paiements',
};

function FilterBar({ filter, onChange, terminals, locationOptions, cashierOptions }: {
  filter: Filter; onChange: (f: Filter) => void; terminals: Terminal[]; locationOptions: string[]; cashierOptions: CashierPerformanceRow[];
}) {
  return (
    <div className="sticky top-0 z-10 mb-6 flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow-card">
      <label className="block text-xs font-bold text-ink-700">Période
        <select className="input mt-1 py-2" value={filter.preset} onChange={(e) => onChange({ ...filter, preset: e.target.value as DatePreset })}>
          {(Object.keys(PRESET_LABEL) as DatePreset[]).map((p) => <option key={p} value={p}>{PRESET_LABEL[p]}</option>)}
        </select>
      </label>
      {filter.preset === 'custom' && (
        <>
          <label className="block text-xs font-bold text-ink-700">Du
            <input type="date" className="input mt-1 py-2" value={filter.from} onChange={(e) => onChange({ ...filter, from: e.target.value })} />
          </label>
          <label className="block text-xs font-bold text-ink-700">Au
            <input type="date" className="input mt-1 py-2" value={filter.to} onChange={(e) => onChange({ ...filter, to: e.target.value })} />
          </label>
        </>
      )}
      <label className="block text-xs font-bold text-ink-700">Emplacement
        <select className="input mt-1 py-2" value={filter.locationId} onChange={(e) => onChange({ ...filter, locationId: e.target.value })}>
          <option value="">Tous</option>
          {locationOptions.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
      </label>
      <label className="block text-xs font-bold text-ink-700">Terminal
        <select className="input mt-1 py-2" value={filter.terminalId} onChange={(e) => onChange({ ...filter, terminalId: e.target.value })}>
          <option value="">Tous</option>
          {terminals.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <label className="block text-xs font-bold text-ink-700">Caissier
        <select className="input mt-1 py-2" value={filter.cashierId} onChange={(e) => onChange({ ...filter, cashierId: e.target.value })}>
          <option value="">Tous</option>
          {cashierOptions.map((c) => <option key={c.cashierId} value={c.cashierId}>{c.cashierName}</option>)}
        </select>
      </label>
      {(filter.locationId || filter.terminalId || filter.cashierId || filter.preset !== 'today') && (
        <button onClick={() => onChange(DEFAULT_FILTER)} className="btn-ghost py-2 text-xs">Réinitialiser</button>
      )}
    </div>
  );
}

function Panel({ title, eyebrow, action, className = '', children }: { title: string; eyebrow: string; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={`card min-w-0 p-5 sm:p-6 ${className}`}>
      <header className="mb-5 flex min-h-11 items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-brand-500">{eyebrow}</p>
          <h2 className="mt-1 text-lg font-black tracking-tight text-ink-900">{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function ReportState<T>({ state, minHeight, children }: { state: LoadState<T> & { retry: () => void }; minHeight: string; children: (data: T) => React.ReactNode }) {
  if (state.loading && !state.data) return <div className={`${minHeight} animate-pulse rounded-xl bg-ink-100 motion-reduce:animate-none`} aria-label="Chargement" />;
  if (state.error && !state.data) return (
    <div className={`${minHeight} grid place-items-center rounded-xl border border-dashed border-rose-200 bg-rose-50 p-6 text-center`}>
      <div><p className="text-sm font-bold text-rose-700">{state.error}</p><button type="button" onClick={state.retry} className="btn-ghost mt-3 min-h-11"><RefreshCw size={15} /> Réessayer</button></div>
    </div>
  );
  if (!state.data || (Array.isArray(state.data) && state.data.length === 0)) return <EmptyState className={minHeight} />;
  return <>{children(state.data)}</>;
}

function EmptyState({ className = '' }: { className?: string }) {
  return <div className={`${className} grid place-items-center rounded-xl border border-dashed border-ink-200 bg-ink-50 p-6 text-center text-sm font-semibold text-ink-500`}>Pas encore de données sur cette période.</div>;
}

// ---------------------------------------------------------------------------
// KPI grid
// ---------------------------------------------------------------------------

function KpiGrid({ state, margin }: { state: LoadState<Kpis> & { retry: () => void }; margin: LoadState<Margin> & { retry: () => void } }) {
  if (state.loading && !state.data) {
    return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">{Array.from({ length: 12 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-ink-100" />)}</div>;
  }
  if (state.error && !state.data) {
    return <div className="rounded-2xl border border-dashed border-rose-200 bg-rose-50 p-6 text-center"><p className="text-sm font-bold text-rose-700">{state.error}</p><button onClick={state.retry} className="btn-ghost mt-3"><RefreshCw size={15} /> Réessayer</button></div>;
  }
  const k = state.data;
  if (!k) return null;

  const cards: { label: string; field: KpiField; money?: boolean; icon: typeof TrendingUp }[] = [
    { label: k.grossRevenue.label, field: k.grossRevenue, money: true, icon: TrendingUp },
    { label: k.netRevenue.label, field: k.netRevenue, money: true, icon: Wallet },
    { label: k.completedTickets.label, field: k.completedTickets, icon: BarChart3 },
    { label: k.averageBasket.label, field: k.averageBasket, money: true, icon: TrendingUp },
    { label: k.productsSold.label, field: k.productsSold, icon: Boxes },
    { label: k.uniqueCustomers.label, field: k.uniqueCustomers, icon: Users },
    { label: k.totalDiscounts.label, field: k.totalDiscounts, money: true, icon: TrendingDown },
    { label: k.averageArticlesPerTicket.label, field: k.averageArticlesPerTicket, icon: BarChart3 },
    { label: k.cashRevenue.label, field: k.cashRevenue, money: true, icon: Wallet },
    { label: k.cardRevenue.label, field: k.cardRevenue, money: true, icon: CreditCard },
    { label: k.loyaltyPointsEarned.label, field: k.loyaltyPointsEarned, icon: Award },
    { label: k.loyaltyPointsRedeemed.label, field: k.loyaltyPointsRedeemed, icon: Gift },
    { label: k.openSessions.label, field: k.openSessions, icon: Wallet },
    { label: k.cashDifference.label, field: k.cashDifference, money: true, icon: AlertTriangle },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6" aria-label="Indicateurs POS">
      {cards.map((card) => <KpiCard key={card.label} {...card} />)}
      <MarginCard state={margin} />
    </section>
  );
}

function KpiCard({ label, field, money, icon: Icon }: { label: string; field: KpiField; money?: boolean; icon: typeof TrendingUp }) {
  const display = field.value === null ? '—' : money ? formatPrice(field.value) : String(field.value);
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-card" title={field.note}>
      <div className="flex items-start justify-between gap-2">
        <Icon size={17} className="text-brand-500" aria-hidden="true" />
        {field.changePercent !== undefined && field.changePercent !== null && <DeltaBadge value={field.changePercent} />}
      </div>
      <p className="mt-3 text-xl font-black tabular-nums tracking-tight text-ink-900">{display}</p>
      <p className="mt-1 text-xs font-bold text-ink-500">{label}</p>
    </div>
  );
}

function MarginCard({ state }: { state: LoadState<Margin> & { retry: () => void } }) {
  const m = state.data;
  if (state.loading && !m) return <div className="h-28 animate-pulse rounded-2xl bg-ink-100" />;
  if (!m) return null;
  if (m.hidden) {
    return (
      <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50 p-4">
        <ShieldAlert size={17} className="text-ink-400" aria-hidden="true" />
        <p className="mt-3 text-sm font-black text-ink-500">Marge masquée</p>
        <p className="mt-1 text-xs font-bold text-ink-500">Permission requise</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-card">
      <TrendingUp size={17} className="text-brand-500" aria-hidden="true" />
      <p className="mt-3 text-xl font-black tabular-nums tracking-tight text-ink-900">
        {m.costUnknown ? 'Coût inconnu' : formatPrice(m.margin ?? 0)}
      </p>
      <p className="mt-1 text-xs font-bold text-ink-500">{m.costUnknown ? 'Marge estimée — coût d\'achat manquant' : `Marge estimée (${m.marginPercent}%)`}</p>
    </div>
  );
}

function DeltaBadge({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums ${positive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
      {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />} {Math.abs(value)}%
    </span>
  );
}

// ---------------------------------------------------------------------------
// Revenue chart
// ---------------------------------------------------------------------------

function RevenueChart({ data }: { data: RevenueSeries }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data.points} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="#eceff3" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: '#6f7072' }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis yAxisId="revenue" tick={{ fontSize: 11, fill: '#6f7072' }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="tickets" orientation="right" allowDecimals={false} tick={{ fontSize: 11, fill: '#6f7072' }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(value, name) => [name === 'Revenu' ? formatPrice(Number(value)) : Number(value), name]} contentStyle={{ borderRadius: 12, borderColor: '#eceff3', boxShadow: '0 8px 24px rgba(15,23,42,.12)' }} />
          <Legend verticalAlign="top" height={32} />
          <Bar yAxisId="tickets" dataKey="tickets" name="Tickets" fill="#ab93f4" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          <Line yAxisId="revenue" type="monotone" dataKey="revenue" name="Revenu" stroke="#1325c4" strokeWidth={3} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payment breakdown
// ---------------------------------------------------------------------------

function PaymentBreakdownPanel({ data }: { data: PaymentBreakdownRow[] }) {
  const chartData = data.map((row) => ({ name: METHOD_LABEL[row.method] ?? row.method, value: row.total }));
  return (
    <div>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={35} outerRadius={60} isAnimationActive={false}>
              {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(value) => formatPrice(Number(value))} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 space-y-2">
        {data.map((row, i) => (
          <li key={row.method} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2 font-bold text-ink-900"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />{METHOD_LABEL[row.method] ?? row.method}</span>
            <span className="text-xs text-ink-500">{row.count} · {row.percentOfRevenue}%</span>
            <span className="font-black tabular-nums text-ink-900">{formatPrice(row.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cashier performance
// ---------------------------------------------------------------------------

function CashierTable({ data, onOpen }: { data: CashierPerformanceRow[]; onOpen: (c: CashierPerformanceRow) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-ink-100 text-xs font-black uppercase text-ink-700">
          <tr>
            <th className="px-4 py-3">Caissier</th><th className="px-4 py-3">Sessions</th><th className="px-4 py-3">Tickets</th>
            <th className="px-4 py-3">CA brut</th><th className="px-4 py-3">Panier moyen</th><th className="px-4 py-3">Remises</th>
            <th className="px-4 py-3">Écart caisse</th><th className="px-4 py-3 text-right">Détail</th>
          </tr>
        </thead>
        <tbody>
          {data.map((c) => (
            <tr key={c.cashierId} className="border-t border-ink-200">
              <td className="px-4 py-3 font-bold text-ink-900">{c.cashierName}</td>
              <td className="px-4 py-3 text-ink-700">{c.sessionCount}</td>
              <td className="px-4 py-3 text-ink-700">{c.ticketCount}</td>
              <td className="px-4 py-3 font-bold">{formatPrice(c.grossRevenue)}</td>
              <td className="px-4 py-3 text-ink-700">{formatPrice(c.averageBasket)}</td>
              <td className="px-4 py-3 text-ink-700">{formatPrice(c.discountsGranted)}</td>
              <td className={`px-4 py-3 font-bold ${c.cashDifference !== 0 ? 'text-amber-600' : 'text-ink-700'}`}>{formatPrice(c.cashDifference)}</td>
              <td className="px-4 py-3 text-right"><button onClick={() => onOpen(c)} className="btn-ghost px-3 py-1.5 text-xs">Ouvrir</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CashierDrawer({ cashier, query, onClose }: { cashier: CashierPerformanceRow; query: string; onClose: () => void }) {
  const detail = useAnalyticsReport<CashierDetail>(`cashiers/${cashier.cashierId}/detail`, query);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-ink-900">{cashier.cashierName}</h2>
            <p className="text-sm text-ink-700">Détail de la période sélectionnée — contrôle opérationnel, pas un classement.</p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100"><X size={18} /></button>
        </div>

        {detail.loading && !detail.data && <div className="h-40 animate-pulse rounded-xl bg-ink-100" />}
        {detail.error && !detail.data && <p className="text-sm font-bold text-rose-700">{detail.error}</p>}
        {detail.data && (
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 text-xs font-black uppercase text-ink-700">Sessions ({detail.data.sessions.length})</h3>
              <ul className="space-y-1.5">
                {detail.data.sessions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between rounded-xl bg-ink-100 px-3 py-2 text-sm">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-black ${s.status === 'OPEN' ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-200 text-ink-700'}`}>{s.status === 'OPEN' ? 'Ouverte' : 'Fermée'}</span>
                    <span className="text-ink-700">{formatDateTime(s.openedAt)}</span>
                    <span className="font-bold">{formatMinor(s.grossSalesMinor)}</span>
                  </li>
                ))}
                {!detail.data.sessions.length && <p className="text-sm text-ink-500">Aucune session.</p>}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-black uppercase text-ink-700">Ventes ({detail.data.sales.length})</h3>
              <ul className="space-y-1.5">
                {detail.data.sales.slice(0, 100).map((s) => (
                  <li key={s.id} className="flex items-center justify-between rounded-xl bg-ink-100 px-3 py-2 text-sm">
                    <span className="font-bold text-brand-700">#{s.saleNumber}</span>
                    <span className="text-ink-700">{formatDateTime(s.createdAt)}</span>
                    <span className="font-bold">{formatMinor(s.totalMinor)}</span>
                  </li>
                ))}
                {!detail.data.sales.length && <p className="text-sm text-ink-500">Aucune vente.</p>}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-black uppercase text-ink-700">Mouvements de caisse ({detail.data.cashMovements.length})</h3>
              <ul className="space-y-1.5">
                {detail.data.cashMovements.map((m) => (
                  <li key={m.id} className="flex items-center justify-between rounded-xl bg-ink-100 px-3 py-2 text-sm">
                    <span className="font-bold text-ink-900">{m.type}</span>
                    <span className="text-ink-700">{m.reason ?? '—'}</span>
                    <span className="font-bold">{formatMinor(m.amountMinor)}</span>
                  </li>
                ))}
                {!detail.data.cashMovements.length && <p className="text-sm text-ink-500">Aucun mouvement.</p>}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Products / categories
// ---------------------------------------------------------------------------

const CHANNEL_LABEL: Record<SalesChannel, string> = { pos: 'Boutique (POS)', online: 'En ligne', all: 'Tous les canaux' };
const SORT_LABEL: Record<ProductSort, string> = { qty: 'Quantité', revenue: 'Chiffre d\'affaires', profit: 'Profit', margin: 'Marge', growth: 'Croissance' };

function ChannelToggle({ value, onChange }: { value: SalesChannel; onChange: (v: SalesChannel) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-bold">
      {(['pos', 'online', 'all'] as const).map((c) => (
        <button key={c} onClick={() => onChange(c)} className={`rounded-md px-2.5 py-1.5 transition ${value === c ? 'bg-brand-500 text-white' : 'text-ink-700 hover:bg-slate-50'}`}>
          {CHANNEL_LABEL[c]}
        </button>
      ))}
    </div>
  );
}

function StockPill({ value }: { value: number }) {
  if (value <= 0) return <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-black text-red-600">0</span>;
  if (value <= 5) return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-700"><AlertTriangle size={10} />{value}</span>;
  return <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-black text-emerald-700">{value}</span>;
}

function TrendBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs font-semibold text-ink-500/60">—</span>;
  const positive = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-black tabular-nums ${positive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
      {positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />} {Math.abs(value)}%
    </span>
  );
}

function TopProductsSection({ className, state, channel, onChannelChange, sort, onSortChange, categoryId, onCategoryIdChange, categories }: {
  className?: string;
  state: LoadState<ProductPerformanceRow[]> & { retry: () => void };
  channel: SalesChannel; onChannelChange: (v: SalesChannel) => void;
  sort: ProductSort; onSortChange: (v: ProductSort) => void;
  categoryId: string; onCategoryIdChange: (v: string) => void;
  categories: Category[];
}) {
  const categoryName = useCallback(
    (id: string) => (id === '__uncategorized__' ? 'Sans catégorie' : categories.find((c) => c.id === id)?.name ?? id),
    [categories],
  );

  return (
    <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden ${className ?? ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-lg font-black tracking-tight text-ink-900">Top produits vendus</h2>
          <p className="text-xs font-medium text-ink-500">{categoryId ? `Filtré sur : ${categoryName(categoryId)}` : 'Toutes catégories confondues'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ChannelToggle value={channel} onChange={onChannelChange} />
          <select className="input w-auto py-2 text-xs" value={categoryId} onChange={(e) => onCategoryIdChange(e.target.value)}>
            <option value="">Toutes les catégories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="input w-auto py-2 text-xs" value={sort} onChange={(e) => onSortChange(e.target.value as ProductSort)}>
            {(Object.keys(SORT_LABEL) as ProductSort[]).map((s) => <option key={s} value={s}>Trier : {SORT_LABEL[s]}</option>)}
          </select>
        </div>
      </div>
      <ReportState state={state} minHeight="h-64">
        {(data) => <TopProductsTable data={data} categoryName={categoryName} />}
      </ReportState>
    </section>
  );
}

function TopProductsTable({ data, categoryName }: { data: ProductPerformanceRow[]; categoryName: (id: string) => string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1180px] text-left text-sm">
        <thead className="border-b-2 border-slate-200 bg-slate-50 text-[11px] font-black uppercase tracking-wide text-ink-700">
          <tr>
            <th className="px-3 py-3">#</th>
            <th className="px-3 py-3">Produit</th>
            <th className="px-3 py-3">Catégorie</th>
            <th className="px-3 py-3 text-right">Qté</th>
            <th className="px-3 py-3 text-right">Tickets/Cmd.</th>
            <th className="px-3 py-3 text-right">CA</th>
            <th className="px-3 py-3 text-right">Coût</th>
            <th className="px-3 py-3 text-right">Profit</th>
            <th className="px-3 py-3 text-right">Marge</th>
            <th className="px-3 py-3 text-right">Boutique</th>
            <th className="px-3 py-3 text-right">Dépôt</th>
            <th className="px-3 py-3 text-right">Entrant</th>
            <th className="px-3 py-3 text-right">Tendance</th>
          </tr>
        </thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.variantId ?? p.productId} className="border-t border-slate-100 hover:bg-slate-50/80">
              <td className="px-3 py-3 font-black tabular-nums text-brand-500">{p.rank}</td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-2.5">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover border border-slate-200" />
                  ) : (
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100"><Package size={15} className="text-ink-500" /></div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-bold text-ink-900">{p.productName}</p>
                    <p className="text-[11px] text-ink-500">{p.sku ?? '—'}</p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-3 text-xs text-ink-700">{p.categoryIds.length ? p.categoryIds.map(categoryName).join(', ') : 'Sans catégorie'}</td>
              <td className="px-3 py-3 text-right font-bold tabular-nums">{p.quantitySold}</td>
              <td className="px-3 py-3 text-right text-ink-700 tabular-nums">{p.transactionCount}</td>
              <td className="px-3 py-3 text-right font-black tabular-nums text-ink-900">{formatPrice(p.revenue)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-ink-700">
                {p.costUnknown ? <span className="text-[11px] font-semibold italic text-ink-500/70">Coût inconnu</span> : p.cost !== null ? formatPrice(p.cost) : '—'}
              </td>
              <td className="px-3 py-3 text-right font-bold tabular-nums text-ink-900">{p.profit !== null ? formatPrice(p.profit) : '—'}</td>
              <td className="px-3 py-3 text-right tabular-nums">{p.marginPercent !== null ? `${p.marginPercent}%` : '—'}</td>
              <td className="px-3 py-3 text-right"><StockPill value={p.boutiqueStock} /></td>
              <td className="px-3 py-3 text-right"><StockPill value={p.depotStock} /></td>
              <td className="px-3 py-3 text-right">
                {p.incomingQty > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-black text-blue-700"><Truck size={10} />{p.incomingQty}</span>
                ) : <span className="text-xs text-ink-500/60">—</span>}
              </td>
              <td className="px-3 py-3 text-right"><TrendBadge value={p.trend.revenueChangePercent} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopCategoriesSection({ className, state, channel, onChannelChange }: {
  className?: string;
  state: LoadState<CategoryPerformanceRow[]> & { retry: () => void };
  channel: SalesChannel; onChannelChange: (v: SalesChannel) => void;
}) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden ${className ?? ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-lg font-black tracking-tight text-ink-900">Catégories les plus performantes</h2>
          <p className="text-xs font-medium text-ink-500">Classé par chiffre d&apos;affaires</p>
        </div>
        <ChannelToggle value={channel} onChange={onChannelChange} />
      </div>
      <div className="p-5">
        <ReportState state={state} minHeight="h-48">
          {(data) => <TopCategoriesCards data={data} />}
        </ReportState>
      </div>
    </section>
  );
}

function TopCategoriesCards({ data }: { data: CategoryPerformanceRow[] }) {
  const max = Math.max(...data.map((c) => c.revenue), 1);
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {data.slice(0, 9).map((c, i) => (
        <div key={c.categoryId} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-500 text-xs font-black text-white">{i + 1}</span>
              <p className="font-bold text-ink-900">{c.categoryName}</p>
            </div>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-black text-brand-700">{c.percentOfRevenue}% du CA</span>
          </div>
          <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${(c.revenue / max) * 100}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <span className="text-ink-500">Quantité</span><span className="text-right font-bold tabular-nums text-ink-900">{c.quantitySold}</span>
            <span className="text-ink-500">CA</span><span className="text-right font-black tabular-nums text-ink-900">{formatPrice(c.revenue)}</span>
            <span className="text-ink-500">Profit</span>
            <span className="text-right font-bold tabular-nums text-ink-900">{c.costUnknown ? <span className="italic text-ink-500/70">Coût inconnu</span> : c.profit !== null ? formatPrice(c.profit) : '—'}</span>
            <span className="text-ink-500">Marge</span><span className="text-right tabular-nums text-ink-900">{c.marginPercent !== null ? `${c.marginPercent}%` : '—'}</span>
          </div>
          {c.bestSellingProduct && <p className="mt-2 truncate text-[11px] text-ink-500">Meilleure vente : <span className="font-bold text-ink-700">{c.bestSellingProduct}</span></p>}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loyalty
// ---------------------------------------------------------------------------

function LoyaltyPanel({ data }: { data: LoyaltyAnalytics }) {
  const stats = [
    { label: 'Ventes identifiées', value: formatPrice(data.identifiedCustomerSales) },
    { label: 'Ventes anonymes', value: formatPrice(data.anonymousSales) },
    { label: 'Cartes actives', value: `${data.cardsActive} / ${data.cardsIssued}` },
    { label: 'Comptes fidélité', value: String(data.totalAccounts) },
    { label: 'Points gagnés', value: String(data.pointsEarned) },
    { label: 'Points échangés', value: String(data.pointsRedeemed) },
    { label: 'Points en circulation', value: String(data.unusedPointsLiability) },
  ];
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl bg-ink-50 p-3">
            <p className="text-xs font-semibold text-ink-500">{s.label}</p>
            <p className="text-lg font-black tabular-nums text-ink-900">{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live activity — polled REST snapshot (backend exposes GET live-sessions,
// not SSE, for this admin-side panel; see docs/pos-analytics research notes).
// ---------------------------------------------------------------------------

function LiveActivityPanel() {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/pos/analytics/live-sessions', { cache: 'no-store' });
      setSessions(res.ok ? await res.json() : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <Panel className="xl:col-span-6" title="Activité en direct" eyebrow={`${sessions.length} session${sessions.length > 1 ? 's' : ''} ouverte${sessions.length > 1 ? 's' : ''}`} action={
      <button onClick={refresh} className="btn-ghost px-3 py-1.5 text-xs"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
    }>
      {!sessions.length ? (
        <EmptyState className="h-40" />
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li key={s.sessionId} className="flex items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm">
              <span className="flex items-center gap-2 font-bold text-ink-900"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />{s.cashierName}</span>
              <span className="text-xs text-ink-500">{s.transactionCount} tickets</span>
              <span className="font-black tabular-nums text-emerald-700">{formatPrice(s.revenue)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Alerts — evidence only, no automatic blame.
// ---------------------------------------------------------------------------

const SEVERITY_STYLE: Record<AlertSeverity, string> = {
  info: 'bg-sky-50 text-sky-700 border-sky-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  critical: 'bg-rose-50 text-rose-700 border-rose-200',
};

function AlertsPanel() {
  const adminHref = useAdminHref();
  const [alerts, setAlerts] = useState<PosAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/pos/analytics/alerts?lookbackHours=72', { cache: 'no-store' });
      setAlerts(res.ok ? await res.json() : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <Panel className="xl:col-span-6" title="Alertes POS" eyebrow="Preuves et liens — 72h" action={
      <button onClick={refresh} className="btn-ghost px-3 py-1.5 text-xs"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
    }>
      {!alerts.length ? (
        <div className="grid h-40 place-items-center rounded-xl bg-emerald-50 text-center">
          <p className="text-sm font-bold text-emerald-800">Aucune alerte sur la période.</p>
        </div>
      ) : (
        <ul className="max-h-80 space-y-2 overflow-y-auto">
          {alerts.map((a, i) => (
            <li key={i} className={`rounded-xl border px-3 py-2.5 text-sm ${SEVERITY_STYLE[a.severity]}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-black">{a.title}</span>
                <span className="text-[11px] font-bold opacity-70">{formatDateTime(a.detectedAt)}</span>
              </div>
              <p className="mt-1 text-xs leading-5">{a.summary}</p>
              {(a.evidence.sessionId || a.evidence.saleId) && (
                <div className="mt-1.5 flex gap-3 text-[11px] font-black underline">
                  {a.evidence.sessionId && <a href={adminHref('/pos-sessions')} className="hover:opacity-70">Voir la session</a>}
                  {a.evidence.cashierName && <span className="no-underline opacity-70">{a.evidence.cashierName}</span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Lost sales — attempts only, never confirmed revenue.
// ---------------------------------------------------------------------------

type LostSaleRow = {
  variantId: string; productId: string; productName: string; attempts: number;
  boutiqueStock: number; depotStock: number; estimatedMissedRevenue: number;
  lastAttemptAt: string; lastCashierName: string;
};

function LostSalesPanel({ query }: { query: string }) {
  const state = useAnalyticsReport<LostSaleRow[]>('lost-sales', query);
  return (
    <Panel className="xl:col-span-12" title="Ventes perdues" eyebrow="Estimation — produits recherchés en rupture, pas un chiffre confirmé">
      <ReportState state={state} minHeight="h-48">
        {(data) => (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b-2 border-slate-200 bg-slate-50 text-[11px] font-black uppercase tracking-wide text-ink-700">
                <tr>
                  <th className="px-3 py-3">Produit</th>
                  <th className="px-3 py-3 text-right">Tentatives</th>
                  <th className="px-3 py-3 text-right">Boutique</th>
                  <th className="px-3 py-3 text-right">Dépôt</th>
                  <th className="px-3 py-3 text-right">Manque à gagner (est.)</th>
                  <th className="px-3 py-3">Dernière tentative</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.variantId} className="border-t border-slate-100">
                    <td className="px-3 py-3 font-bold text-ink-900">{r.productName}</td>
                    <td className="px-3 py-3 text-right font-black tabular-nums text-rose-600">{r.attempts}</td>
                    <td className="px-3 py-3 text-right"><StockPill value={r.boutiqueStock} /></td>
                    <td className="px-3 py-3 text-right"><StockPill value={r.depotStock} /></td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums text-ink-900">≈ {formatPrice(r.estimatedMissedRevenue)}</td>
                    <td className="px-3 py-3 text-xs text-ink-500">{formatDateTime(r.lastAttemptAt)} · {r.lastCashierName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportState>
    </Panel>
  );
}
