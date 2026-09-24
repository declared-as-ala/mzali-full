'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Banknote, Boxes, Download, Package, Printer, RefreshCw, TrendingUp, Truck, X } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDateTime } from '@/lib/site-config';
import { useAdminHref } from '@/lib/admin-nav-context';
import { useToast } from './Toast';

// Hand-kept in sync with backend/src/contracts/delivery-revenue.ts —
// this reporting-only domain intentionally has no frontend types/ mirror
// (see that file's header comment).
type Preset = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';
type ProviderKey = 'navex' | 'firstdelivery' | 'axess' | 'manual';

type Summary = {
  grossRevenueMinor: number; returnsRevenueMinor: number; netRevenueMinor: number;
  deliveredCount: number; returnedCount: number; averageBasketMinor: number;
  productRevenueMinor: number; shippingRevenueMinor: number;
};
type DayRow = { date: string; deliveredCount: number; revenueMinor: number };
type ProviderRow = { provider: ProviderKey; deliveredCount: number; revenueMinor: number };
type OrderRow = {
  id: string; orderNumber: number; customerName: string; phone: string; provider: ProviderKey;
  tracking: string | null; deliveredAt: string; totalMinor: number; returned: boolean; manual: boolean;
};

const PRESET_LABEL: Record<Preset, string> = {
  today: "Aujourd'hui", yesterday: 'Hier', thisWeek: 'Cette semaine', thisMonth: 'Ce mois',
  lastMonth: 'Mois précédent', thisYear: 'Cette année', custom: 'Période personnalisée',
};
const PROVIDER_LABEL: Record<ProviderKey, string> = { navex: 'Navex', firstdelivery: 'First Delivery', axess: 'Axess', manual: 'Confirmé manuellement' };

function money(minor: number): string {
  return `${(minor / 1000).toFixed(3)} DT`;
}
function qs(params: Record<string, string | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) s.set(k, v);
  return s.toString();
}

export default function ChiffreAffairesCommandesView() {
  const toast = useToast();
  const adminHref = useAdminHref();
  const [preset, setPreset] = useState<Preset>('lastMonth');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [byDay, setByDay] = useState<DayRow[]>([]);
  const [byProvider, setByProvider] = useState<ProviderRow[]>([]);
  const [daySort, setDaySort] = useState<{ key: 'date' | 'deliveredCount' | 'revenueMinor'; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'asc' });
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<ProviderKey | 'all' | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const query = useMemo(() => {
    if (preset === 'custom') return { preset, from: customFrom || undefined, to: customTo || undefined };
    return { preset };
  }, [preset, customFrom, customTo]);
  const queryString = useMemo(() => qs(query), [query]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, dRes, pRes] = await Promise.all([
        fetch(`/api/admin/delivery-revenue/summary?${queryString}`, { cache: 'no-store' }),
        fetch(`/api/admin/delivery-revenue/by-day?${queryString}`, { cache: 'no-store' }),
        fetch(`/api/admin/delivery-revenue/by-provider?${queryString}`, { cache: 'no-store' }),
      ]);
      if (sRes.ok) setSummary(await sRes.json());
      if (dRes.ok) setByDay(await dRes.json());
      if (pRes.ok) setByProvider(await pRes.json());
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => { refresh(); }, [refresh]);

  const sortedByDay = useMemo(() => {
    const sorted = [...byDay].sort((a, b) => {
      const av = a[daySort.key], bv = b[daySort.key];
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return daySort.dir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [byDay, daySort]);

  function toggleDaySort(key: typeof daySort.key) {
    setDaySort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  async function exportReport(format: 'csv' | 'xlsx' | 'pdf') {
    setExporting(format);
    try {
      const res = await fetch('/api/admin/delivery-revenue/export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, ...query }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.downloadUrl) { toast.error(data?.error ?? "Échec de l'export"); return; }
      window.open(data.downloadUrl, '_blank');
      toast.success('Export généré');
    } finally {
      setExporting(null);
    }
  }

  const providerTotal = byProvider.reduce((sum, r) => sum + r.revenueMinor, 0);

  return (
    <div className="p-8 print:p-0">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-black text-ink-900">Chiffre d&apos;affaires commandes</h1>
          <p className="text-ink-700">Basé uniquement sur les colis confirmés <strong>livrés</strong> par le transporteur — jamais sur le statut admin de la commande.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={refresh} className="btn-ghost px-3 py-2 text-xs"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualiser</button>
          <button onClick={() => window.print()} className="btn-ghost px-3 py-2 text-xs"><Printer size={14} /> Imprimer</button>
          <ExportMenu exporting={exporting} onExport={exportReport} />
        </div>
      </header>

      <div className="sticky top-0 z-10 mb-6 flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow-card print:hidden">
        <label className="block text-xs font-bold text-ink-700">Période
          <select className="input mt-1 py-2" value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
            {(Object.keys(PRESET_LABEL) as Preset[]).map((p) => <option key={p} value={p}>{PRESET_LABEL[p]}</option>)}
          </select>
        </label>
        {preset === 'custom' && (
          <>
            <label className="block text-xs font-bold text-ink-700">Date début
              <input type="date" className="input mt-1 py-2" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </label>
            <label className="block text-xs font-bold text-ink-700">Date fin
              <input type="date" className="input mt-1 py-2" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </label>
          </>
        )}
      </div>

      {summary && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={Banknote} label="Chiffre d'affaires livré (net)" value={money(summary.netRevenueMinor)} accent />
          <KpiCard icon={Package} label="Colis livrés" value={String(summary.deliveredCount)} />
          <KpiCard icon={TrendingUp} label="Panier moyen" value={money(summary.averageBasketMinor)} />
          <KpiCard icon={Boxes} label="Retours (colis / DT)" value={`${summary.returnedCount} / ${money(summary.returnsRevenueMinor)}`} warn={summary.returnedCount > 0} />
        </div>
      )}

      {summary && (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-ink-200 bg-white p-4 text-sm">
            <p className="text-ink-500">CA brut livré</p>
            <p className="text-lg font-black text-ink-900">{money(summary.grossRevenueMinor)}</p>
          </div>
          <div className="rounded-2xl border border-ink-200 bg-white p-4 text-sm">
            <p className="text-ink-500">CA produits</p>
            <p className="text-lg font-black text-ink-900">{money(summary.productRevenueMinor)}</p>
          </div>
          <div className="rounded-2xl border border-ink-200 bg-white p-4 text-sm">
            <p className="text-ink-500">Frais de livraison</p>
            <p className="text-lg font-black text-ink-900">{money(summary.shippingRevenueMinor)}</p>
          </div>
        </div>
      )}

      <section className="card mb-6 p-5">
        <h2 className="mb-4 text-lg font-black text-ink-900">Chiffre d&apos;affaires par jour</h2>
        {!byDay.length ? (
          <div className="grid h-64 place-items-center rounded-xl border border-dashed border-ink-200 bg-ink-50 text-sm font-semibold text-ink-500">Pas encore de livraisons sur cette période.</div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={byDay} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="#eceff3" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6f7072' }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 11, fill: '#6f7072' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value) => money(Number(value))} contentStyle={{ borderRadius: 12, borderColor: '#eceff3', boxShadow: '0 8px 24px rgba(15,23,42,.12)' }} />
                <Bar dataKey="revenueMinor" name="CA" fill="#1325c4" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-black text-ink-900">Répartition par jour</h2>
            <button onClick={() => setDrill('all')} className="btn-ghost px-3 py-1.5 text-xs">Voir les commandes</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink-100 text-[11px] font-black uppercase tracking-wide text-ink-700">
                <tr>
                  <SortableTh label="Date" active={daySort.key === 'date'} dir={daySort.dir} onClick={() => toggleDaySort('date')} />
                  <SortableTh label="Colis livrés" align="right" active={daySort.key === 'deliveredCount'} dir={daySort.dir} onClick={() => toggleDaySort('deliveredCount')} />
                  <SortableTh label="Chiffre d'affaires" align="right" active={daySort.key === 'revenueMinor'} dir={daySort.dir} onClick={() => toggleDaySort('revenueMinor')} />
                </tr>
              </thead>
              <tbody>
                {sortedByDay.map((d) => (
                  <tr key={d.date} className="border-t border-ink-200">
                    <td className="px-3 py-2.5 font-bold text-ink-900">{d.date}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-700">{d.deliveredCount}</td>
                    <td className="px-3 py-2.5 text-right font-black tabular-nums text-ink-900">{money(d.revenueMinor)}</td>
                  </tr>
                ))}
                {!sortedByDay.length && <tr><td colSpan={3} className="px-3 py-8 text-center text-ink-500">Aucune donnée.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-lg font-black text-ink-900">Répartition par transporteur</h2>
          <ul className="space-y-2">
            {byProvider.map((p) => (
              <li key={p.provider}>
                <button onClick={() => setDrill(p.provider)} className="flex w-full items-center justify-between gap-3 rounded-xl bg-ink-50 px-3 py-2.5 text-sm hover:bg-ink-100">
                  <span className="flex items-center gap-2 font-bold text-ink-900"><Truck size={14} className="text-brand-500" /> {PROVIDER_LABEL[p.provider]}</span>
                  <span className="text-xs text-ink-500">{p.deliveredCount} colis</span>
                  <span className="font-black tabular-nums text-ink-900">{money(p.revenueMinor)}</span>
                </button>
              </li>
            ))}
            {!byProvider.length && <li className="py-8 text-center text-sm text-ink-500">Aucune donnée.</li>}
          </ul>
          {byProvider.length > 0 && (
            <div className="mt-3 flex justify-between border-t border-ink-200 pt-3 text-sm font-black text-ink-900">
              <span>Total</span><span>{money(providerTotal)}</span>
            </div>
          )}
        </section>
      </div>

      {drill && <OrderDrillDown provider={drill} query={query} onClose={() => setDrill(null)} adminHref={adminHref} />}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, accent, warn }: { icon: typeof Banknote; label: string; value: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-card ${warn ? 'border-amber-200 bg-amber-50' : accent ? 'border-brand-200 bg-brand-50' : 'border-ink-200 bg-white'}`}>
      <Icon size={17} className={warn ? 'text-amber-600' : accent ? 'text-brand-600' : 'text-brand-500'} aria-hidden="true" />
      <p className="mt-3 text-xl font-black tabular-nums tracking-tight text-ink-900">{value}</p>
      <p className="mt-1 text-xs font-bold text-ink-500">{label}</p>
    </div>
  );
}

function SortableTh({ label, align, active, dir, onClick }: { label: string; align?: 'right'; active: boolean; dir: 'asc' | 'desc'; onClick: () => void }) {
  return (
    <th className={`px-3 py-3 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button onClick={onClick} className={`inline-flex items-center gap-1 hover:text-ink-900 ${active ? 'text-ink-900' : ''}`}>
        {label} {active && (dir === 'asc' ? '▲' : '▼')}
      </button>
    </th>
  );
}

function ExportMenu({ exporting, onExport }: { exporting: string | null; onExport: (format: 'csv' | 'xlsx' | 'pdf') => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="btn-primary inline-flex items-center gap-2 px-3 py-2 text-xs">
        <Download size={14} /> Exporter
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-40 rounded-2xl bg-white p-2 shadow-card" onMouseLeave={() => setOpen(false)}>
          {(['csv', 'xlsx', 'pdf'] as const).map((format) => (
            <button key={format} disabled={exporting === format} onClick={() => onExport(format)} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-bold uppercase text-ink-700 hover:bg-ink-100 disabled:opacity-40">
              {format}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function OrderDrillDown({ provider, query, onClose, adminHref }: {
  provider: ProviderKey | 'all';
  query: Record<string, string | undefined>;
  onClose: () => void;
  adminHref: (path: string) => string;
}) {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const perPage = 50;

  useEffect(() => {
    setLoading(true);
    const params = { ...query, page: String(page), perPage: String(perPage), provider: provider === 'all' ? undefined : provider };
    fetch(`/api/admin/delivery-revenue/orders?${qs(params)}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { items: [], total: 0 }))
      .then((data) => { setRows(data.items ?? []); setTotal(data.total ?? 0); })
      .finally(() => setLoading(false));
  }, [provider, query, page]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <div className="h-full w-full max-w-4xl overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-ink-900">Commandes livrées</h2>
            <p className="text-sm text-ink-700">{provider === 'all' ? 'Toutes' : PROVIDER_LABEL[provider]} — {total} commande(s)</p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100"><X size={18} /></button>
        </div>

        {loading && !rows.length ? (
          <div className="h-64 animate-pulse rounded-xl bg-ink-100" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b-2 border-ink-200 bg-ink-50 text-[11px] font-black uppercase tracking-wide text-ink-700">
                <tr>
                  <th className="px-3 py-3">Commande</th>
                  <th className="px-3 py-3">Client</th>
                  <th className="px-3 py-3">Téléphone</th>
                  <th className="px-3 py-3">Transporteur</th>
                  <th className="px-3 py-3">Tracking</th>
                  <th className="px-3 py-3">Date livraison</th>
                  <th className="px-3 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={`border-t border-ink-200 ${r.returned ? 'bg-rose-50/50' : ''}`}>
                    <td className="px-3 py-2.5">
                      <Link href={adminHref(`/commandes?q=${r.orderNumber}`)} className="font-bold text-brand-700 hover:underline">#{r.orderNumber}</Link>
                      {r.manual && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Manuel</span>}
                      {r.returned && <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">Retourné</span>}
                    </td>
                    <td className="px-3 py-2.5 text-ink-900">{r.customerName}</td>
                    <td className="px-3 py-2.5 text-ink-700">{r.phone}</td>
                    <td className="px-3 py-2.5 text-ink-700">{PROVIDER_LABEL[r.provider]}</td>
                    <td className="px-3 py-2.5 text-ink-700">{r.tracking ?? '—'}</td>
                    <td className="px-3 py-2.5 text-ink-700">{formatDateTime(r.deliveredAt)}</td>
                    <td className="px-3 py-2.5 text-right font-black tabular-nums text-ink-900">{money(r.totalMinor)}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={7} className="px-3 py-10 text-center text-ink-500">Aucune commande.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {total > perPage && (
          <div className="mt-4 flex items-center justify-between text-xs font-bold text-ink-700">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="btn-ghost px-3 py-1.5 disabled:opacity-40">Précédent</button>
            <span>Page {page} / {Math.ceil(total / perPage)}</span>
            <button onClick={() => setPage((p) => p + 1)} disabled={page * perPage >= total} className="btn-ghost px-3 py-1.5 disabled:opacity-40">Suivant</button>
          </div>
        )}
      </div>
    </div>
  );
}
