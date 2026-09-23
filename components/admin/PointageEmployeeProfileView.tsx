'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock, Wallet } from 'lucide-react';
import { useAdminHref } from '@/lib/admin-nav-context';

// Hand-kept in sync with backend/src/contracts/attendance.ts (no
// frontend types/ mirror for this isolated domain — see that file's header).
type AttendanceEmployeeRecord = {
  id: string; firstName: string; lastName: string; phone: string; email: string | null;
  jobTitle: string; hourlyRateMinor: number; active: boolean; hiredAt: string | null; notes: string;
};
type AttendanceEmployeeSummary = {
  employee: AttendanceEmployeeRecord;
  todayMinutes: number; weekMinutes: number; monthMinutes: number;
  unpaidMinutes: number; unpaidAmountMinor: number; totalPaidAmountMinor: number;
};
type AttendanceDailyHoursEntry = { date: string; minutes: number };

function hours(minutes: number): string {
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}
function money(minor: number): string {
  return `${(minor / 1000).toFixed(3)} DT`;
}

export default function PointageEmployeeProfileView({ employeeId }: { employeeId: string }) {
  const adminHref = useAdminHref();
  const [summary, setSummary] = useState<AttendanceEmployeeSummary | null>(null);
  const [daily, setDaily] = useState<AttendanceDailyHoursEntry[]>([]);
  const [preset, setPreset] = useState<'today' | 'week' | 'month'>('week');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/admin/attendance/employees/${employeeId}/summary`, { cache: 'no-store' }),
      fetch(`/api/admin/attendance/employees/${employeeId}/daily?preset=${preset}`, { cache: 'no-store' }),
    ])
      .then(async ([sRes, dRes]) => {
        if (cancelled) return;
        if (!sRes.ok) throw new Error('Employé introuvable.');
        setSummary(await sRes.json());
        setDaily(dRes.ok ? await dRes.json() : []);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [employeeId, preset]);

  if (loading && !summary) return <div className="p-8"><div className="h-40 animate-pulse rounded-2xl bg-ink-100" /></div>;
  if (error || !summary) return <div className="p-8"><p className="text-sm font-bold text-rose-700">{error ?? 'Employé introuvable.'}</p></div>;

  const { employee } = summary;
  const maxMinutes = Math.max(...daily.map((d) => d.minutes), 1);

  return (
    <div className="p-8">
      <Link href={adminHref('/pointage')} className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-ink-700 hover:text-ink-900">
        <ArrowLeft size={14} /> Retour au pointage
      </Link>

      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink-900">{employee.firstName} {employee.lastName}</h1>
          <p className="text-ink-700">{employee.jobTitle || 'Employé'} · {employee.phone} · {money(employee.hourlyRateMinor)}/h</p>
        </div>
        <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-bold ${employee.active ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-100 text-ink-700'}`}>
          {employee.active ? 'Actif' : 'Inactif'}
        </span>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={Clock} label="Aujourd'hui" value={hours(summary.todayMinutes)} />
        <StatCard icon={Clock} label="Cette semaine" value={hours(summary.weekMinutes)} />
        <StatCard icon={Clock} label="Ce mois" value={hours(summary.monthMinutes)} />
        <StatCard icon={Wallet} label="Heures impayées" value={hours(summary.unpaidMinutes)} accent={summary.unpaidMinutes > 0} />
        <StatCard icon={Wallet} label="Montant impayé" value={money(summary.unpaidAmountMinor)} accent={summary.unpaidAmountMinor > 0} />
        <StatCard icon={Wallet} label="Total déjà payé" value={money(summary.totalPaidAmountMinor)} />
      </div>

      <section className="card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-ink-900">Heures par jour</h2>
          <div className="inline-flex rounded-lg border border-ink-200 bg-white p-0.5 text-xs font-bold">
            {(['today', 'week', 'month'] as const).map((p) => (
              <button key={p} onClick={() => setPreset(p)} className={`rounded-md px-2.5 py-1.5 transition ${preset === p ? 'bg-brand-500 text-white' : 'text-ink-700 hover:bg-ink-100'}`}>
                {p === 'today' ? "Aujourd'hui" : p === 'week' ? 'Semaine' : 'Mois'}
              </button>
            ))}
          </div>
        </div>
        {!daily.length ? (
          <p className="py-8 text-center text-sm text-ink-500">Aucune heure travaillée sur cette période.</p>
        ) : (
          <ul className="space-y-2">
            {daily.map((d) => (
              <li key={d.date} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs font-bold text-ink-700">{d.date}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${(d.minutes / maxMinutes) * 100}%` }} />
                </div>
                <span className="w-16 shrink-0 text-right text-xs font-black tabular-nums text-ink-900">{hours(d.minutes)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: typeof Clock; label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-card ${accent ? 'border-amber-200 bg-amber-50' : 'border-ink-200 bg-white'}`}>
      <Icon size={17} className={accent ? 'text-amber-600' : 'text-brand-500'} aria-hidden="true" />
      <p className="mt-3 text-lg font-black tabular-nums tracking-tight text-ink-900">{value}</p>
      <p className="mt-1 text-xs font-bold text-ink-500">{label}</p>
    </div>
  );
}
