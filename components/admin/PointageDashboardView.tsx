'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, RefreshCw, Users, AlertTriangle, PenLine, Trophy, X } from 'lucide-react';
import { formatDateTime } from '@/lib/site-config';
import { useAdminHref } from '@/lib/admin-nav-context';
import { useToast } from './Toast';

// Hand-kept in sync with backend/src/contracts/attendance.ts — this
// isolated Pointage domain intentionally has no frontend types/ mirror
// (see the contract file's own header comment).
type AttendancePresentEntry = { employeeId: string; firstName: string; lastName: string; clockIn: string; currentMinutes: number };
type AttendanceDashboardStats = { presentNow: number; hoursTodayMinutes: number; employeesClockedToday: number; openSessions: number; present: AttendancePresentEntry[] };
type SessionStatus = 'OPEN' | 'CLOSED' | 'NEEDS_REVIEW';
type AttendanceSessionRow = {
  id: string; employeeId: string; employeeName: string; clockIn: string; clockOut: string | null;
  durationMinutes: number | null; status: SessionStatus; businessDate: string; source: string | null; payrollPaymentId: string | null;
};
type AttendanceTopEmployeeEntry = { employeeId: string; firstName: string; lastName: string; totalMinutes: number };
type TopEmployeesPreset = 'today' | 'week' | 'month';

const STATUS_LABEL: Record<SessionStatus, string> = { OPEN: 'En cours', CLOSED: 'Terminée', NEEDS_REVIEW: 'À corriger' };
const STATUS_STYLE: Record<SessionStatus, string> = {
  OPEN: 'bg-emerald-100 text-emerald-700', CLOSED: 'bg-ink-100 text-ink-700', NEEDS_REVIEW: 'bg-amber-100 text-amber-700',
};

function hours(minutes: number): string {
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}

export default function PointageDashboardView() {
  const toast = useToast();
  const adminHref = useAdminHref();
  const [dashboard, setDashboard] = useState<AttendanceDashboardStats | null>(null);
  const [sessions, setSessions] = useState<AttendanceSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', from: '', to: '' });
  const [correcting, setCorrecting] = useState<AttendanceSessionRow | null>(null);
  const [topEmployees, setTopEmployees] = useState<AttendanceTopEmployeeEntry[]>([]);
  const [topPreset, setTopPreset] = useState<TopEmployeesPreset>('week');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      const [dRes, sRes] = await Promise.all([
        fetch('/api/admin/attendance/dashboard', { cache: 'no-store' }),
        fetch(`/api/admin/attendance/sessions?${params.toString()}`, { cache: 'no-store' }),
      ]);
      if (dRes.ok) setDashboard(await dRes.json());
      if (sRes.ok) {
        const data = await sRes.json();
        setSessions(Array.isArray(data?.items) ? data.items : []);
      }
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/attendance/top-employees?preset=${topPreset}&limit=10`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => { if (!cancelled) setTopEmployees(Array.isArray(data) ? data : []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [topPreset]);

  return (
    <div className="p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink-900">Pointage</h1>
          <p className="text-ink-700">Présences en direct, historique et corrections — équipe pointage, indépendante des comptes Admin/Caisse.</p>
        </div>
        <button onClick={refresh} className="btn-ghost px-3 py-2 text-xs"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualiser</button>
      </header>

      {dashboard && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Users} label="Présents actuellement" value={String(dashboard.presentNow)} />
          <StatCard icon={Clock} label="Heures aujourd'hui" value={hours(dashboard.hoursTodayMinutes)} />
          <StatCard icon={Users} label="Employés pointés aujourd'hui" value={String(dashboard.employeesClockedToday)} />
          <StatCard icon={AlertTriangle} label="Sessions ouvertes / à revoir" value={String(dashboard.openSessions)} accent={dashboard.openSessions > 0} />
        </div>
      )}

      {dashboard && dashboard.present.length > 0 && (
        <section className="card mb-6 p-5">
          <h2 className="mb-3 text-lg font-black text-ink-900">Présents actuellement</h2>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {dashboard.present.map((p) => (
              <li key={p.employeeId} className="flex items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm">
                <Link href={adminHref(`/pointage/${p.employeeId}`)} className="flex items-center gap-2 font-bold text-ink-900 hover:underline">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />{p.firstName} {p.lastName}
                </Link>
                <span className="text-xs font-bold text-emerald-700">{hours(p.currentMinutes)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card mb-6 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-black text-ink-900"><Trophy size={18} className="text-amber-500" /> Meilleurs employés</h2>
          <div className="inline-flex rounded-lg border border-ink-200 bg-white p-0.5 text-xs font-bold">
            {(['today', 'week', 'month'] as const).map((p) => (
              <button key={p} onClick={() => setTopPreset(p)} className={`rounded-md px-2.5 py-1.5 transition ${topPreset === p ? 'bg-brand-500 text-white' : 'text-ink-700 hover:bg-ink-100'}`}>
                {p === 'today' ? "Aujourd'hui" : p === 'week' ? 'Semaine' : 'Mois'}
              </button>
            ))}
          </div>
        </div>
        {!topEmployees.length ? (
          <p className="py-6 text-center text-sm text-ink-500">Aucune heure travaillée sur cette période.</p>
        ) : (
          <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {topEmployees.map((e, i) => (
              <li key={e.employeeId} className="flex items-center gap-2.5 rounded-xl bg-ink-50 px-3 py-2 text-sm">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-500 text-xs font-black text-white">{i + 1}</span>
                <Link href={adminHref(`/pointage/${e.employeeId}`)} className="flex-1 truncate font-bold text-ink-900 hover:underline">{e.firstName} {e.lastName}</Link>
                <span className="shrink-0 text-xs font-black tabular-nums text-ink-700">{hours(e.totalMinutes)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-black text-ink-900">Sessions</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select className="input w-auto py-2 text-xs" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">Tous les statuts</option>
              <option value="OPEN">En cours</option>
              <option value="CLOSED">Terminées</option>
              <option value="NEEDS_REVIEW">À corriger</option>
            </select>
            <input type="date" className="input w-auto py-2 text-xs" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
            <input type="date" className="input w-auto py-2 text-xs" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-ink-100 text-[11px] font-black uppercase tracking-wide text-ink-700">
              <tr>
                <th className="px-3 py-3">Employé</th>
                <th className="px-3 py-3">Arrivée</th>
                <th className="px-3 py-3">Départ</th>
                <th className="px-3 py-3 text-right">Durée</th>
                <th className="px-3 py-3">Statut</th>
                <th className="px-3 py-3 text-right">Corriger</th>
              </tr>
            </thead>
            <tbody>
              {!loading && sessions.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-ink-500">Aucune session sur cette période.</td></tr>}
              {sessions.map((s) => (
                <tr key={s.id} className="border-t border-ink-200">
                  <td className="px-3 py-3 font-bold text-ink-900">
                    <Link href={adminHref(`/pointage/${s.employeeId}`)} className="hover:underline">{s.employeeName}</Link>
                  </td>
                  <td className="px-3 py-3 text-ink-700">{formatDateTime(s.clockIn)}</td>
                  <td className="px-3 py-3 text-ink-700">{s.clockOut ? formatDateTime(s.clockOut) : '—'}</td>
                  <td className="px-3 py-3 text-right font-bold tabular-nums">{s.durationMinutes !== null ? hours(s.durationMinutes) : '—'}</td>
                  <td className="px-3 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLE[s.status]}`}>{STATUS_LABEL[s.status]}</span></td>
                  <td className="px-3 py-3 text-right">
                    {s.payrollPaymentId ? (
                      <span className="text-[11px] font-bold text-ink-500" title="Déjà payée — non modifiable">Payée</span>
                    ) : (
                      <button onClick={() => setCorrecting(s)} className="rounded-lg p-2 text-ink-700 hover:bg-ink-100" title="Corriger"><PenLine size={15} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {correcting && (
        <CorrectionModal
          session={correcting}
          onClose={() => setCorrecting(null)}
          onSaved={() => { setCorrecting(null); refresh(); }}
          toast={toast}
        />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: typeof Clock; label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-card ${accent ? 'border-amber-200 bg-amber-50' : 'border-ink-200 bg-white'}`}>
      <Icon size={17} className={accent ? 'text-amber-600' : 'text-brand-500'} aria-hidden="true" />
      <p className="mt-3 text-xl font-black tabular-nums tracking-tight text-ink-900">{value}</p>
      <p className="mt-1 text-xs font-bold text-ink-500">{label}</p>
    </div>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function CorrectionModal({ session, onClose, onSaved, toast }: {
  session: AttendanceSessionRow;
  onClose: () => void;
  onSaved: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [clockIn, setClockIn] = useState(toLocalInput(session.clockIn));
  const [clockOut, setClockOut] = useState(session.clockOut ? toLocalInput(session.clockOut) : '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (reason.trim().length < 3) { toast.error('Un motif (3 caractères minimum) est requis.'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/attendance/sessions/${session.id}/correct`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clockIn: new Date(clockIn).toISOString(), clockOut: clockOut ? new Date(clockOut).toISOString() : undefined, reason: reason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? 'Erreur');
      toast.success('Session corrigée.');
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black text-ink-900">Corriger la session</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-ink-100"><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-ink-700">{session.employeeName} — l&apos;heure d&apos;origine est conservée dans l&apos;historique, jamais effacée.</p>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-700">Arrivée</span>
            <input type="datetime-local" className="input" value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-700">Départ (laisser vide si non terminée)</span>
            <input type="datetime-local" className="input" value={clockOut} onChange={(e) => setClockOut(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-700">Motif de la correction</span>
            <textarea rows={2} className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Employé a oublié de pointer sa sortie…" />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-ink-200 px-4 py-2 text-sm font-bold text-ink-700 hover:bg-ink-100">Annuler</button>
          <button onClick={save} disabled={saving} className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50">
            {saving ? 'Enregistrement…' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}
