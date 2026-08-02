'use client';
import { Banknote, CreditCard, Layers, Receipt, ShoppingBag, Split, TrendingUp, UserCheck, Clock } from 'lucide-react';
import { formatMinor } from '@/lib/money';
import type { PosCashierSession, PosDashboardSummary } from '@/types/pos';

function Kpi({ icon, label, value, tone = 'default' }: {
  icon: React.ReactNode; label: string; value: string; tone?: 'default' | 'emerald' | 'blue' | 'amber';
}) {
  const toneClasses = {
    default: 'bg-white border-slate-200/80 text-slate-900',
    emerald: 'bg-emerald-50/60 border-emerald-200 text-emerald-900',
    blue: 'bg-blue-50/60 border-blue-200 text-blue-900',
    amber: 'bg-amber-50/60 border-amber-200 text-amber-900',
  }[tone];
  return (
    <div className={`rounded-3xl border p-4 shadow-sm ${toneClasses}`}>
      <div className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-500">
        {icon} {label}
      </div>
      <p className="text-2xl font-black tabular-nums">{value}</p>
    </div>
  );
}

export default function DashboardKpis({
  summary, session, cashierName, loading,
}: {
  summary: PosDashboardSummary | null;
  session: PosCashierSession | null;
  cashierName: string;
  loading: boolean;
}) {
  const durationLabel = (() => {
    if (!session) return '—';
    const ms = Date.now() - new Date(session.openedAt).getTime();
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    return `${hours}h${String(minutes).padStart(2, '0')}`;
  })();

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-3xl border border-slate-200/80 bg-slate-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Kpi icon={<TrendingUp size={13} />} label="CA du jour" value={formatMinor(summary?.grossRevenueMinor ?? 0)} tone="emerald" />
      <Kpi icon={<Receipt size={13} />} label="Tickets" value={String(summary?.ticketCount ?? 0)} />
      <Kpi icon={<Layers size={13} />} label="Panier moyen" value={formatMinor(summary?.avgBasketMinor ?? 0)} />
      <Kpi icon={<ShoppingBag size={13} />} label="Articles vendus" value={String(summary?.productsSoldQty ?? 0)} />
      <Kpi icon={<UserCheck size={13} />} label="Caissier" value={cashierName} tone="blue" />
      <Kpi icon={<Clock size={13} />} label="Durée de session" value={durationLabel} tone="blue" />
      <Kpi icon={<Banknote size={13} />} label="Ventes espèces" value={formatMinor(summary?.cashMinor ?? 0)} />
      <Kpi icon={<CreditCard size={13} />} label="Ventes carte" value={formatMinor(summary?.cardMinor ?? 0)} />
      <Kpi icon={<Split size={13} />} label="Paiements mixtes" value={formatMinor(summary?.mixedMinor ?? 0)} tone="amber" />
    </div>
  );
}
