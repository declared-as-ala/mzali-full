'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight,
  Boxes, Download, PackageCheck, RefreshCw, ShoppingCart,
  TicketPercent, TrendingUp, Truck, UserPlus, WalletCards,
  X, Layers, Activity, Calendar, ShieldAlert, Store, Sparkles,
  ExternalLink, ChevronRight
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart,
  Legend, Line, LineChart, ResponsiveContainer, Tooltip,
  XAxis, YAxis
} from 'recharts';
import { formatPrice } from '@/lib/site-config';
import type {
  CarrierPerformance, CouponPerformance, DashboardStats,
  GeographyPerformance, PosCashierPerformance, PosDailyPoint,
  RevenueSeriesPoint, StatusFunnelPoint
} from '@/types/dashboard';
import { STATUS_CHART_COLOR, STATUS_LABEL } from '../CommandesView';

const RANGE_OPTIONS = [
  { days: 1, label: "Aujourd'hui" },
  { days: 7, label: '7 jours' },
  { days: 30, label: '30 jours' },
  { days: 90, label: '90 jours' },
  { days: 365, label: 'Tout' },
] as const;

const CARRIER_LABEL = { navex: 'Navex', firstdelivery: 'First Delivery', axess: 'Axess' } as const;

type LoadState<T> = { data: T | null; loading: boolean; error: string | null };

function useReport<T>(report: string, days?: number, initial: T | null = null) {
  const [state, setState] = useState<LoadState<T>>({ data: initial, loading: !initial, error: null });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: null }));
    const query = days ? `?days=${days}${days > 90 ? '&granularity=week' : ''}` : '';
    fetch(`/api/admin/stats/${report}${query}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.href = `/admin-login?from=${encodeURIComponent(window.location.pathname)}`;
          throw new Error('Session expirée. Redirection…');
        }
        if (!response.ok) throw new Error('Impossible de charger ces données.');
        return response.json() as Promise<T>;
      })
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState((current) => ({
          data: current.data,
          loading: false,
          error: error instanceof Error ? error.message : 'Données indisponibles.',
        }));
      });
    return () => controller.abort();
  }, [report, days, attempt]);

  return { ...state, retry };
}

function delta(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(new Date(`${value}T12:00:00`));
}

function compactNumber(value: number) {
  return new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function exportRevenueCsv(data: RevenueSeriesPoint[]) {
  const rows = ['date,revenue_tnd,commandes', ...data.map((point) => `${point.date},${point.revenue},${point.orders}`)];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `mzali-revenus-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

const DEFAULT_STATS: DashboardStats = {
  revenue: { today: 0, last7Days: 0, last30Days: 0 },
  orders: { today: 0, last7Days: 0, last30Days: 0, total: 0 },
  averageOrderValue: 0,
  statusMix: {},
  topProducts: [],
  lowStock: [],
  perEmployee: [],
  period: {
    days: 30, revenue: 0, orders: 0, averageOrderValue: 0,
    repeatCustomerRate: 0, cancelledRate: 0, exchangeRate: 0,
    newCustomers: 0, abandonedCarts: 0
  },
  previousPeriod: { revenue: 0, orders: 0 },
  generatedAt: new Date().toISOString(),
};

export default function DashboardCommandCenter({ initialDashboard }: { initialDashboard?: DashboardStats | null }) {
  const [days, setDays] = useState(30);
  const [alertVisible, setAlertVisible] = useState(true);

  const initial = initialDashboard ?? DEFAULT_STATS;
  const dashboard = useReport<DashboardStats>('dashboard', days, initial);
  const revenue   = useReport<RevenueSeriesPoint[]>('revenue-series', days);
  const funnel    = useReport<StatusFunnelPoint[]>('status-funnel', days);
  const carriers  = useReport<CarrierPerformance[]>('carrier-performance', days);
  const geography = useReport<GeographyPerformance[]>('geography', days);
  const coupons   = useReport<CouponPerformance[]>('coupon-performance');
  const posDaily  = useReport<PosDailyPoint[]>('pos-daily', days);
  const posByCashier = useReport<PosCashierPerformance[]>('pos-by-cashier', days);

  const stats = dashboard.data ?? initial;
  const revenueDelta = delta(stats.period.revenue, stats.previousPeriod.revenue);
  const ordersDelta  = delta(stats.period.orders, stats.previousPeriod.orders);

  const alert = useMemo(() => {
    if (stats.period.abandonedCarts > 0) {
      return {
        text: `${stats.period.abandonedCarts} panier${stats.period.abandonedCarts > 1 ? 's' : ''} abandonné${stats.period.abandonedCarts > 1 ? 's' : ''} sur la période — relancez pour récupérer ces ventes.`,
        href: '/admin/commandes?tab=abandoned',
        action: 'Voir les paniers',
      };
    }
    if (stats.lowStock.length > 0) {
      return {
        text: `${stats.lowStock.length} produit${stats.lowStock.length > 1 ? 's' : ''} sous le seuil de stock recommandé.`,
        href: '/admin/stock?lowStock=true',
        action: 'Gérer le stock'
      };
    }
    return null;
  }, [stats]);

  return (
    <div className="min-h-full bg-[#F4F6F9] p-6 lg:p-8 space-y-8">
      {/* ── LUXE HEADER ─────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between border-b border-slate-200/80 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-black text-blue-600 border border-blue-500/20">
              <Sparkles size={13} /> Luxe Executive Dashboard
            </span>
            <span className="text-xs text-slate-500 font-medium">Mzali Enterprise</span>
          </div>
          <h1 className="mt-2 text-3xl font-black text-slate-900 tracking-tight sm:text-4xl">
            Vue d&apos;ensemble
          </h1>
          <p className="mt-1 text-sm text-slate-500 max-w-xl">
            Indicateurs financiers, mouvements de stock et performance commerciale en temps réel.
          </p>
        </div>

        {/* Date Selector & Action buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-2xl bg-white p-1 shadow-sm border border-slate-200" aria-label="Période">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.days}
                type="button"
                onClick={() => setDays(option.days)}
                className={`rounded-xl px-3.5 py-2 text-xs font-extrabold transition-all duration-150 ${
                  days === option.days
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => dashboard.retry()}
            className="grid h-10 w-10 place-items-center rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm transition"
            title="Actualiser"
          >
            <RefreshCw size={15} className={dashboard.loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {/* ── ALERT BANNER ────────────────────────────────────────────────── */}
      {alertVisible && alert && (
        <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-amber-900 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-500/10 p-2 text-amber-600">
              <AlertTriangle size={18} />
            </div>
            <p className="text-sm font-bold">{alert.text}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={alert.href}
              className="inline-flex items-center gap-1 rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-black text-white hover:bg-amber-700 shadow-sm transition"
            >
              {alert.action} <ArrowRight size={13} />
            </Link>
            <button
              onClick={() => setAlertVisible(false)}
              className="grid h-8 w-8 place-items-center rounded-lg text-amber-700 hover:bg-amber-100 transition"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ── KPI STRIP (Luxe Modern Cards) ───────────────────────────────── */}
      <KpiStrip
        stats={stats}
        revenueDelta={revenueDelta}
        ordersDelta={ordersDelta}
        series={revenue.data ?? []}
        loading={dashboard.loading}
      />

      {/* ── MAIN CHARTS & PANELS GRID ───────────────────────────────────── */}
      <div className="grid gap-6 xl:grid-cols-12">
        {/* Revenue & Orders Chart */}
        <LuxePanel
          className="xl:col-span-8"
          title="Tendance des revenus"
          eyebrow={`Performance sur ${days} jour${days > 1 ? 's' : ''}`}
          action={
            revenue.data?.length ? (
              <button
                type="button"
                onClick={() => exportRevenueCsv(revenue.data ?? [])}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-sm"
              >
                <Download size={14} /> Exporter CSV
              </button>
            ) : null
          }
        >
          <ReportState state={revenue} minHeight="h-80">
            {(data) => <RevenueChart data={data} />}
          </ReportState>
        </LuxePanel>

        {/* Order Status Funnel */}
        <LuxePanel className="xl:col-span-4" title="Parcours des commandes" eyebrow="Répartition par statut">
          <ReportState state={funnel} minHeight="h-80">
            {(data) => <StatusFunnel data={data} />}
          </ReportState>
        </LuxePanel>

        {/* Top Selling Products */}
        <LuxePanel className="xl:col-span-5" title="Top Produits" eyebrow="Classement par ventes">
          <TopProducts products={stats.topProducts} />
        </LuxePanel>

        {/* Low Stock Watchlist */}
        <LuxePanel className="xl:col-span-3" title="Stock à surveiller" eyebrow="Alertes de réapprovisionnement">
          <LowStock products={stats.lowStock} />
        </LuxePanel>

        {/* Employee Workload */}
        <LuxePanel className="xl:col-span-4" title="Charge de l'équipe" eyebrow="Commandes actives assignées">
          <EmployeeWorkload employees={stats.perEmployee} />
        </LuxePanel>

        {/* Carrier Performance */}
        <LuxePanel className="xl:col-span-7" title="Expéditions & Transporteurs" eyebrow="Taux de livraison réussi">
          <ReportState state={carriers} minHeight="h-64">
            {(data) => <CarrierPanel data={data} />}
          </ReportState>
        </LuxePanel>

        {/* Geography Panel */}
        <LuxePanel className="xl:col-span-5" title="Top Gouvernorats" eyebrow="Zones les plus rentables">
          <ReportState state={geography} minHeight="h-64">
            {(data) => <GeographyPanel data={data} />}
          </ReportState>
        </LuxePanel>

        {/* POS Sales Panel (if active) */}
        {!posDaily.loading && !posDaily.error && (posDaily.data ?? []).some((p) => p.transactionCount > 0) && (
          <LuxePanel
            className="xl:col-span-12"
            title="Point de Vente (Boutique)"
            eyebrow="Tickets & Caisses"
            action={
              <Link href="/admin/pos-sessions" className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700">
                Voir toutes les sessions <ArrowRight size={13} />
              </Link>
            }
          >
            <PosSalesPanel daily={posDaily.data ?? []} byCashier={posByCashier.data ?? []} />
          </LuxePanel>
        )}

        {/* Coupon Performance */}
        {!coupons.loading && !coupons.error && (coupons.data?.length ?? 0) > 0 && (
          <LuxePanel className="xl:col-span-12" title="Codes Promo & Offres" eyebrow="Impact des réductions">
            <CouponPanel data={coupons.data ?? []} />
          </LuxePanel>
        )}
      </div>
    </div>
  );
}

// ─── KPI Strip Component ──────────────────────────────────────────────────────
function KpiStrip({
  stats, revenueDelta, ordersDelta, series, loading,
}: {
  stats: DashboardStats;
  revenueDelta: number;
  ordersDelta: number;
  series: RevenueSeriesPoint[];
  loading: boolean;
}) {
  const cards = [
    {
      label: 'Revenu Total',
      value: formatPrice(stats.period.revenue),
      icon: WalletCards,
      delta: revenueDelta,
      bg: 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-emerald-500/10',
      detail: 'vs période précédente',
    },
    {
      label: 'Commandes',
      value: String(stats.orders?.total ?? stats.period.orders),
      icon: ShoppingCart,
      delta: ordersDelta,
      bg: 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-blue-500/10',
      detail: `${stats.period.orders} sur la période`,
    },
    {
      label: 'Taux Annulation',
      value: `${stats.period.cancelledRate}%`,
      icon: PackageCheck,
      bg: 'bg-gradient-to-br from-amber-600 to-orange-700 text-white shadow-orange-500/10',
      detail: `${stats.period.exchangeRate}% d'échanges`,
    },
    {
      label: 'Nouveaux Clients',
      value: String(stats.period.newCustomers),
      icon: UserPlus,
      bg: 'bg-gradient-to-br from-cyan-600 to-blue-700 text-white shadow-cyan-500/10',
      detail: `${stats.period.abandonedCarts} paniers abandonnés`,
    },
    {
      label: 'Stock Alertes',
      value: String(stats.lowStock.length),
      icon: Boxes,
      bg: 'bg-gradient-to-br from-rose-600 to-pink-700 text-white shadow-rose-500/10',
      detail: 'références à réapprovisionner',
      href: '/admin/stock?lowStock=true',
    },
  ];

  return (
    <section className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 ${loading ? 'opacity-75' : ''}`}>
      {cards.map((card, idx) => {
        const content = (
          <div className={`relative flex flex-col justify-between overflow-hidden rounded-3xl ${card.bg} p-5 shadow-xl border border-white/10 transition-transform duration-200 hover:-translate-y-0.5`}>
            <div className="flex items-center justify-between">
              <div className="rounded-2xl bg-white/15 p-2.5 backdrop-blur-md">
                <card.icon size={20} />
              </div>
              {card.delta !== undefined && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-white/20 px-2 py-0.5 text-xs font-black backdrop-blur-md">
                  {card.delta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {Math.abs(card.delta)}%
                </span>
              )}
            </div>
            <div className="mt-4">
              <p className="text-2xl font-black tracking-tight">{card.value}</p>
              <p className="text-xs font-bold text-white/90 mt-0.5">{card.label}</p>
              <p className="text-[10px] text-white/70 mt-1">{card.detail}</p>
            </div>
          </div>
        );
        return card.href ? (
          <Link key={card.label} href={card.href} className="block">
            {content}
          </Link>
        ) : (
          <div key={card.label}>{content}</div>
        );
      })}
    </section>
  );
}

// ─── Luxe Panel Box Container ─────────────────────────────────────────────────
function LuxePanel({
  title, eyebrow, action, className = '', children,
}: {
  title: string; eyebrow: string; action?: React.ReactNode; className?: string; children: React.ReactNode;
}) {
  return (
    <section className={`rounded-3xl bg-white border border-slate-200/80 p-6 shadow-sm ${className}`}>
      <header className="mb-5 flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">{eyebrow}</span>
          <h2 className="text-lg font-black text-slate-900 tracking-tight mt-0.5">{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function ReportState<T>({
  state, minHeight, children,
}: {
  state: LoadState<T> & { retry: () => void }; minHeight: string; children: (data: T) => React.ReactNode;
}) {
  if (state.loading && !state.data) {
    return <div className={`${minHeight} animate-pulse rounded-2xl bg-slate-100`} />;
  }
  if (state.error && !state.data) {
    return (
      <div className={`${minHeight} flex flex-col items-center justify-center rounded-2xl border border-dashed border-rose-200 bg-rose-50/50 p-6 text-center`}>
        <p className="text-sm font-bold text-rose-700">{state.error}</p>
        <button
          onClick={state.retry}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm border border-slate-200"
        >
          <RefreshCw size={13} /> Réessayer
        </button>
      </div>
    );
  }
  if (!state.data || (Array.isArray(state.data) && state.data.length === 0)) {
    return <EmptyState className={minHeight} />;
  }
  return <>{children(state.data)}</>;
}

function EmptyState({ className = '' }: { className?: string }) {
  return (
    <div className={`${className} flex items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs font-semibold text-slate-400`}>
      Aucune donnée enregistrée sur la période.
    </div>
  );
}

// ─── Revenue Chart ────────────────────────────────────────────────────────────
function RevenueChart({ data }: { data: RevenueSeriesPoint[] }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="revenue" tickFormatter={compactNumber} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="orders" orientation="right" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <Tooltip
            labelFormatter={(lbl) => shortDate(String(lbl))}
            formatter={(val, name) => [name === 'Revenu' ? formatPrice(Number(val)) : Number(val), name]}
            contentStyle={{ borderRadius: '16px', borderColor: '#e2e8f0', boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}
          />
          <Legend verticalAlign="top" height={32} />
          <Bar yAxisId="orders" dataKey="orders" name="Commandes" fill="#93c5fd" radius={[6, 6, 0, 0]} maxBarSize={28} />
          <Line yAxisId="revenue" type="monotone" dataKey="revenue" name="Revenu" stroke="#1d4ed8" strokeWidth={3.5} dot={false} activeDot={{ r: 6 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Status Funnel ────────────────────────────────────────────────────────────
function StatusFunnel({ data }: { data: StatusFunnelPoint[] }) {
  const visible = data.filter((r) => r.count > 0);
  if (!visible.length) return <EmptyState className="h-80" />;
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={visible} layout="vertical" margin={{ left: 10, right: 10 }}>
          <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} hide />
          <YAxis type="category" dataKey="status" width={95} tickFormatter={(st) => STATUS_LABEL[st] ?? st} tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v) => [Number(v), 'Commandes']} labelFormatter={(st) => STATUS_LABEL[String(st)] ?? st} />
          <Bar dataKey="count" name="Commandes" radius={[0, 8, 8, 0]}>
            {visible.map((row) => (
              <Cell key={row.status} fill={STATUS_CHART_COLOR[row.status] ?? '#2563eb'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Top Products ─────────────────────────────────────────────────────────────
function TopProducts({ products }: { products: DashboardStats['topProducts'] }) {
  if (!products.length) return <EmptyState className="h-56" />;
  const max = Math.max(...products.map((p) => p.quantity), 1);
  return (
    <ol className="space-y-3.5">
      {products.map((product, idx) => (
        <li key={product.productId} className="flex flex-col gap-1.5 rounded-2xl bg-slate-50/80 p-3 border border-slate-100">
          <div className="flex items-center gap-3 text-sm">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-600 text-xs font-black text-white">
              {idx + 1}
            </span>
            <Link
              href={`/admin/produits?productId=${encodeURIComponent(product.productId)}`}
              className="min-w-0 flex-1 truncate font-bold text-slate-900 hover:text-blue-600 transition"
            >
              {product.name}
            </Link>
            <span className="font-black text-slate-900">×{product.quantity}</span>
          </div>
          <div className="flex items-center gap-3 pl-9">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(4, (product.quantity / max) * 100)}%` }} />
            </div>
            <span className="text-xs font-bold text-slate-600">{formatPrice(product.revenue)}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ─── Low Stock Watchlist ──────────────────────────────────────────────────────
const LOCATION_LABEL: Record<string, string> = { DEPOT: 'Dépôt', BOUTIQUE: 'Boutique' };

function LowStock({ products }: { products: DashboardStats['lowStock'] }) {
  if (!products.length) {
    return (
      <div className="flex flex-col items-center justify-center h-56 rounded-2xl bg-emerald-50/80 border border-emerald-100 p-4 text-center">
        <PackageCheck size={32} className="text-emerald-600 mb-2" />
        <p className="text-sm font-bold text-emerald-900">Stock Optimal</p>
        <p className="text-xs text-emerald-700 mt-1">Tous les stocks sont au-dessus du seuil d&apos;alerte.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {products.slice(0, 7).map((product) => {
        const deficit = Math.max(0, product.threshold - product.available);
        return (
          <li key={`${product.productId}-${product.locationId}`}>
            <Link
              href={`/admin/stock?productId=${encodeURIComponent(product.productId)}`}
              className="flex items-center gap-3 rounded-2xl bg-rose-50/80 border border-rose-100 p-2.5 hover:bg-rose-100/80 transition"
            >
              <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${product.available <= 0 ? 'bg-rose-600' : 'bg-amber-500'}`} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-900 truncate">{product.name}</p>
                <span className="text-[10px] font-bold text-rose-700">{LOCATION_LABEL[product.locationId] ?? product.locationId}</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-black text-rose-700">{product.available}/{product.threshold}</span>
                <span className="block text-[10px] text-rose-500 font-bold">-{deficit}</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Employee Workload ────────────────────────────────────────────────────────
function EmployeeWorkload({ employees }: { employees: DashboardStats['perEmployee'] }) {
  if (!employees.length) return <EmptyState className="h-56" />;
  const max = Math.max(...employees.map((e) => e.activeOrders), 1);
  return (
    <ul className="space-y-3">
      {employees.map((employee) => (
        <li key={employee.employeeId} className="space-y-1">
          <div className="flex justify-between text-xs font-bold text-slate-900">
            <span>{employee.name}</span>
            <span className="text-blue-600 font-black">{employee.activeOrders} active{employee.activeOrders !== 1 ? 's' : ''}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${(employee.activeOrders / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── Carrier Performance ──────────────────────────────────────────────────────
function CarrierPanel({ data }: { data: CarrierPerformance[] }) {
  const failures = data.flatMap((c) => c.recentFailures.map((f) => ({ ...f, carrier: c.carrier })));
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_.9fr]">
      <div className="space-y-4">
        {data.map((carrier) => (
          <div key={carrier.carrier} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-extrabold text-slate-900 text-sm">{CARRIER_LABEL[carrier.carrier]}</p>
                <p className="text-xs text-slate-500">{carrier.pushed} envois · {carrier.averagePushMinutes == null ? 'délai N/A' : `${carrier.averagePushMinutes}m moy.`}</p>
              </div>
              <p className="text-xl font-black text-blue-600">{carrier.successRate}%</p>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-rose-100">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${carrier.successRate}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
        <div className="flex items-center gap-2 mb-3">
          <Truck size={16} className="text-rose-600" />
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Échecs récents</h3>
        </div>
        {failures.length ? (
          <ul className="space-y-2 text-xs">
            {failures.slice(0, 5).map((failure) => (
              <li key={`${failure.carrier}-${failure.orderId}`} className="border-b border-slate-200/60 pb-2 last:border-0">
                <Link href={`/admin/commandes?orderId=${failure.orderId}`} className="font-bold text-blue-600 hover:underline">
                  #{failure.orderNumber} ({CARRIER_LABEL[failure.carrier]})
                </Link>
                <p className="text-rose-600 truncate">{failure.error ?? 'Erreur non spécifiée'}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs font-bold text-emerald-600">Aucun échec sur la période.</p>
        )}
      </div>
    </div>
  );
}

// ─── Geography Panel ──────────────────────────────────────────────────────────
function GeographyPanel({ data }: { data: GeographyPerformance[] }) {
  const max = Math.max(...data.map((r) => r.revenue), 1);
  return (
    <ol className="space-y-3">
      {data.slice(0, 7).map((row, idx) => (
        <li key={row.city} className="space-y-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-4 font-black text-blue-600">{idx + 1}</span>
            <span className="flex-1 font-bold text-slate-900 truncate">{row.city}</span>
            <span className="text-slate-500 font-medium">{row.orders} cmd.</span>
            <span className="font-black text-slate-900">{formatPrice(row.revenue)}</span>
          </div>
          <div className="ml-6 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(row.revenue / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

// ─── POS Sales Panel ──────────────────────────────────────────────────────────
function PosSalesPanel({ daily, byCashier }: { daily: PosDailyPoint[]; byCashier: PosCashierPerformance[] }) {
  const totalRevenue = daily.reduce((sum, p) => sum + p.revenue, 0);
  const totalTickets = daily.reduce((sum, p) => sum + p.transactionCount, 0);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_.7fr]">
      <div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100">
            <p className="text-[10px] font-bold text-slate-500 uppercase">Revenu POS</p>
            <p className="text-xl font-black text-slate-900">{formatPrice(totalRevenue)}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100">
            <p className="text-[10px] font-bold text-slate-500 uppercase">Tickets</p>
            <p className="text-xl font-black text-slate-900">{totalTickets}</p>
          </div>
        </div>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={daily} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={compactNumber} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => [formatPrice(Number(v)), 'Revenu']} labelFormatter={(l) => shortDate(String(l))} />
              <Bar dataKey="revenue" fill="#1d4ed8" radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
        <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-3">Caissiers</h3>
        {byCashier.length ? (
          <ul className="space-y-2 text-xs">
            {byCashier.map((c) => (
              <li key={c.cashierId} className="flex justify-between items-center py-1 border-b border-slate-200/60 last:border-0">
                <span className="font-bold text-slate-900">{c.name}</span>
                <span className="font-black text-blue-600">{formatPrice(c.revenue)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs font-semibold text-slate-400">Aucune vente enregistrée.</p>
        )}
      </div>
    </div>
  );
}

// ─── Coupon Panel ─────────────────────────────────────────────────────────────
function CouponPanel({ data }: { data: CouponPerformance[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-slate-100 text-[11px] font-black uppercase text-slate-400">
            <th className="pb-3">Code</th>
            <th className="pb-3">Utilisations</th>
            <th className="pb-3">Limite</th>
            <th className="pb-3 text-right">Total Remise</th>
          </tr>
        </thead>
        <tbody>
          {data.map((c) => (
            <tr key={c.couponId} className="border-b border-slate-100 last:border-0">
              <td className="py-3 font-black text-blue-600">{c.code}</td>
              <td className="py-3 font-bold text-slate-900">{c.usageCount}</td>
              <td className="py-3 text-slate-500">{c.usageLimit ?? 'Illimitée'}</td>
              <td className="py-3 text-right font-black text-slate-900">{formatPrice(c.totalDiscount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
