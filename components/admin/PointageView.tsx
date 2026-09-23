'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Power, Download, Banknote, Clock, X } from 'lucide-react';
import { formatDateTime } from '@/lib/site-config';
import Drawer from './Drawer';
import { useToast } from './Toast';

// Hand-kept in sync with backend/src/contracts/attendance.ts — this
// isolated Pointage/payroll domain intentionally has no frontend types/
// mirror (see that file's header comment).
type AttendanceEmployee = {
  id: string; firstName: string; lastName: string; phone: string; email: string | null;
  jobTitle: string; hourlyRateMinor: number; active: boolean; hiredAt: string | null; notes: string;
};
type AttendancePresentEntry = { employeeId: string; firstName: string; lastName: string; clockIn: string; currentMinutes: number };
type AttendanceEmployeeSummary = {
  employee: AttendanceEmployee;
  todayMinutes: number; weekMinutes: number; monthMinutes: number;
  unpaidMinutes: number; unpaidAmountMinor: number; totalPaidAmountMinor: number;
};
type AttendanceDailyHoursEntry = { date: string; minutes: number };
type PaymentMethod = 'cash' | 'transfer' | 'other';
type PayrollPaymentRecord = {
  id: string; payrollNumber: string; totalMinutes: number; baseAmountMinor: number;
  bonusMinor: number; deductionMinor: number; finalAmountMinor: number;
  paymentMethod: PaymentMethod; paidAt: string; paidByName: string;
};

const METHOD_LABEL: Record<PaymentMethod, string> = { cash: 'Espèces', transfer: 'Virement', other: 'Autre' };

function fullName(e: { firstName: string; lastName: string }): string {
  return [e.firstName, e.lastName].filter(Boolean).join(' ');
}
function hours(minutes: number): string {
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}
function money(minor: number): string {
  return `${(minor / 1000).toFixed(3)} DT`;
}

export default function PointageView() {
  const toast = useToast();
  const [employees, setEmployees] = useState<AttendanceEmployee[]>([]);
  const [present, setPresent] = useState<Map<string, AttendancePresentEntry>>(new Map());
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [eRes, dRes] = await Promise.all([
        fetch('/api/admin/pointage-employes', { cache: 'no-store' }),
        fetch('/api/admin/attendance/dashboard', { cache: 'no-store' }),
      ]);
      const eData = eRes.ok ? await eRes.json() : [];
      if (Array.isArray(eData)) setEmployees(eData);
      const dData = dRes.ok ? await dRes.json() : null;
      const entries: AttendancePresentEntry[] = Array.isArray(dData?.present) ? dData.present : [];
      setPresent(new Map(entries.map((p) => [p.employeeId, p])));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...employees].sort((a, b) => {
      const aActive = present.has(a.id) ? 0 : 1;
      const bActive = present.has(b.id) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return fullName(a).localeCompare(fullName(b));
    });
    if (!q) return sorted;
    return sorted.filter((e) => `${fullName(e)} ${e.jobTitle}`.toLowerCase().includes(q));
  }, [employees, present, query]);

  const selected = employees.find((e) => e.id === selectedId) ?? null;

  return (
    <div className="p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink-900">Pointage</h1>
          <p className="text-ink-700">Personnel, présence en direct et paiements — indépendant des comptes Admin/Caisse.</p>
        </div>
        <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600">
          <Plus size={16} /> Ajouter un employé
        </button>
      </header>

      <div className="card mb-4 flex items-center gap-2 p-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-700" />
          <input className="input pl-9" placeholder="Rechercher un employé…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <span className="text-xs font-bold text-ink-500">{present.size} en session actuellement</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {loading && !employees.length && Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-ink-100" />)}
        {!loading && filtered.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-ink-200 bg-ink-50 p-10 text-center text-sm font-semibold text-ink-500">
            Aucun employé.
          </div>
        )}
        {filtered.map((e) => {
          const live = present.get(e.id);
          return (
            <button
              key={e.id}
              onClick={() => setSelectedId(e.id)}
              className="card flex items-center gap-3 p-4 text-left transition hover:shadow-md"
            >
              <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-black text-white ${live ? 'bg-emerald-500' : 'bg-ink-300'}`}>
                {e.firstName.slice(0, 1).toUpperCase()}{e.lastName.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-ink-900">{fullName(e)}</p>
                <p className="truncate text-xs text-ink-500">{e.jobTitle || 'Employé'}</p>
              </div>
              {live ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> {hours(live.currentMinutes)}
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-bold text-ink-500">Hors service</span>
              )}
            </button>
          );
        })}
      </div>

      {addOpen && <AddEmployeeModal onClose={() => setAddOpen(false)} onCreated={() => { setAddOpen(false); refresh(); }} toast={toast} />}

      <EmployeeDrawer
        open={!!selected}
        employee={selected}
        live={selected ? present.get(selected.id) ?? null : null}
        onClose={() => setSelectedId(null)}
        onChanged={refresh}
        toast={toast}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add employee — name + PIN only, per the simplified flow.
// ---------------------------------------------------------------------------

function AddEmployeeModal({ onClose, onCreated, toast }: { onClose: () => void; onCreated: () => void; toast: ReturnType<typeof useToast> }) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { toast.error('Le nom est obligatoire.'); return; }
    if (!/^\d{4,6}$/.test(pin)) { toast.error('Le code PIN doit contenir 4 à 6 chiffres.'); return; }
    setSaving(true);
    try {
      const [firstName, ...rest] = name.trim().split(/\s+/);
      const res = await fetch('/api/admin/pointage-employes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName: rest.join(' ') || undefined, pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? 'Erreur');
      toast.success('Employé ajouté.');
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black text-ink-900">Ajouter un employé</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-ink-100"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-700">Nom</span>
            <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ahmed Ben Ali" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-700">Code PIN (4-6 chiffres)</span>
            <input className="input" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="4821" />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-ink-200 px-4 py-2 text-sm font-bold text-ink-700 hover:bg-ink-100">Annuler</button>
          <button onClick={save} disabled={saving} className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50">
            {saving ? 'Enregistrement…' : 'Ajouter'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Employee detail drawer — status, pay calculator, history, daily hours.
// ---------------------------------------------------------------------------

function EmployeeDrawer({ open, employee, live, onClose, onChanged, toast }: {
  open: boolean;
  employee: AttendanceEmployee | null;
  live: AttendancePresentEntry | null;
  onClose: () => void;
  onChanged: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [summary, setSummary] = useState<AttendanceEmployeeSummary | null>(null);
  const [daily, setDaily] = useState<AttendanceDailyHoursEntry[]>([]);
  const [preset, setPreset] = useState<'today' | 'week' | 'month'>('week');
  const [payments, setPayments] = useState<PayrollPaymentRecord[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async () => {
    if (!employee) return;
    const [sRes, dRes, pRes] = await Promise.all([
      fetch(`/api/admin/attendance/employees/${employee.id}/summary`, { cache: 'no-store' }),
      fetch(`/api/admin/attendance/employees/${employee.id}/daily?preset=${preset}`, { cache: 'no-store' }),
      fetch(`/api/admin/payroll/payments?employeeId=${employee.id}&perPage=20`, { cache: 'no-store' }),
    ]);
    if (sRes.ok) setSummary(await sRes.json());
    if (dRes.ok) setDaily(await dRes.json());
    if (pRes.ok) {
      const data = await pRes.json();
      setPayments(Array.isArray(data?.items) ? data.items : []);
    }
  }, [employee, preset]);

  useEffect(() => { if (open) load(); }, [open, load]);

  async function toggleActive() {
    if (!employee) return;
    setToggling(true);
    try {
      const res = await fetch(`/api/admin/pointage-employes/${employee.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !employee.active }),
      });
      if (!res.ok) throw new Error('Erreur');
      toast.success(employee.active ? 'Employé désactivé.' : 'Employé activé.');
      onChanged();
    } catch {
      toast.error('Erreur');
    } finally {
      setToggling(false);
    }
  }

  if (!employee) return <Drawer open={open} onClose={onClose} title="" width="max-w-[640px]"><></></Drawer>;

  const maxMinutes = Math.max(...daily.map((d) => d.minutes), 1);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="max-w-[640px]"
      title={
        <div className="flex items-center gap-3">
          <span>{fullName(employee)}</span>
          {live ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> En session · {hours(live.currentMinutes)}
            </span>
          ) : (
            <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-bold text-ink-500">Hors service</span>
          )}
        </div>
      }
      actions={
        <button onClick={toggleActive} disabled={toggling} className={`rounded-lg p-2 hover:bg-ink-100 ${employee.active ? 'text-amber-600' : 'text-emerald-600'}`} title={employee.active ? 'Désactiver' : 'Activer'}>
          <Power size={17} />
        </button>
      }
    >
      {!summary ? (
        <div className="h-40 animate-pulse rounded-2xl bg-ink-100" />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={Clock} label="Aujourd'hui" value={hours(summary.todayMinutes)} />
            <StatCard icon={Clock} label="Cette semaine" value={hours(summary.weekMinutes)} />
            <StatCard icon={Banknote} label="Impayé" value={hours(summary.unpaidMinutes)} accent={summary.unpaidMinutes > 0} />
            <StatCard icon={Banknote} label="Total payé" value={money(summary.totalPaidAmountMinor)} />
          </div>

          <button
            onClick={() => setPayOpen(true)}
            disabled={summary.unpaidMinutes === 0}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 py-3.5 text-sm font-black text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-500"
          >
            <Banknote size={17} /> {summary.unpaidMinutes === 0 ? 'Aucune heure impayée' : `Payer (${hours(summary.unpaidMinutes)} impayées)`}
          </button>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-black text-ink-900">Heures par jour</h3>
              <div className="inline-flex rounded-lg border border-ink-200 bg-white p-0.5 text-xs font-bold">
                {(['today', 'week', 'month'] as const).map((p) => (
                  <button key={p} onClick={() => setPreset(p)} className={`rounded-md px-2 py-1 transition ${preset === p ? 'bg-brand-500 text-white' : 'text-ink-700 hover:bg-ink-100'}`}>
                    {p === 'today' ? "Aujourd'hui" : p === 'week' ? 'Semaine' : 'Mois'}
                  </button>
                ))}
              </div>
            </div>
            {!daily.length ? (
              <p className="py-4 text-center text-xs text-ink-500">Aucune heure travaillée sur cette période.</p>
            ) : (
              <ul className="space-y-1.5">
                {daily.map((d) => (
                  <li key={d.date} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-xs font-bold text-ink-700">{d.date}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${(d.minutes / maxMinutes) * 100}%` }} />
                    </div>
                    <span className="w-14 shrink-0 text-right text-xs font-black tabular-nums text-ink-900">{hours(d.minutes)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-sm font-black text-ink-900">Historique des paiements</h3>
            {!payments.length ? (
              <p className="py-4 text-center text-xs text-ink-500">Aucun paiement enregistré.</p>
            ) : (
              <ul className="space-y-1.5">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl bg-ink-50 px-3 py-2.5 text-sm">
                    <div>
                      <p className="font-bold text-brand-700">{p.payrollNumber}</p>
                      <p className="text-[11px] text-ink-500">{formatDateTime(p.paidAt)} · {METHOD_LABEL[p.paymentMethod]}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-black tabular-nums text-ink-900">{money(p.finalAmountMinor)}</span>
                      <a href={`/api/admin/payroll/payments/${p.id}/pdf`} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-100" title="Fiche de paie">
                        <Download size={14} />
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {payOpen && summary && (
        <PayModal
          employee={employee}
          summary={summary}
          onClose={() => setPayOpen(false)}
          onPaid={() => { setPayOpen(false); load(); onChanged(); }}
          toast={toast}
        />
      )}
    </Drawer>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: typeof Clock; label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-3 ${accent ? 'border-amber-200 bg-amber-50' : 'border-ink-200 bg-white'}`}>
      <Icon size={15} className={accent ? 'text-amber-600' : 'text-brand-500'} aria-hidden="true" />
      <p className="mt-2 text-base font-black tabular-nums tracking-tight text-ink-900">{value}</p>
      <p className="mt-0.5 text-[11px] font-bold text-ink-500">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pay calculator — the admin types the hourly price here (never fixed on
// the employee), sees the amount computed live, then confirms.
// ---------------------------------------------------------------------------

function PayModal({ employee, summary, onClose, onPaid, toast }: {
  employee: AttendanceEmployee;
  summary: AttendanceEmployeeSummary;
  onClose: () => void;
  onPaid: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [rate, setRate] = useState(employee.hourlyRateMinor ? (employee.hourlyRateMinor / 1000).toFixed(3) : '');
  const [bonus, setBonus] = useState('0');
  const [deduction, setDeduction] = useState('0');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const toMinor = (v: string) => Math.max(0, Math.round((Number.parseFloat(v.replace(',', '.')) || 0) * 1000));
  const rateMinor = toMinor(rate);
  const bonusMinor = toMinor(bonus);
  const deductionMinor = toMinor(deduction);
  const baseAmountMinor = Math.round((summary.unpaidMinutes * rateMinor) / 60);
  const finalAmountMinor = baseAmountMinor + bonusMinor - deductionMinor;

  async function confirm() {
    if (rateMinor <= 0) { toast.error("Entrez un prix de l'heure."); return; }
    if (finalAmountMinor < 0) { toast.error('Le montant final ne peut pas être négatif.'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/payroll/employees/${employee.id}/pay`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hourlyRateMinor: rateMinor, bonusMinor, deductionMinor, paymentMethod: method, note: note.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? 'Erreur');
      toast.success(`Paiement ${data?.payrollNumber ?? ''} enregistré.`);
      onPaid();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black text-ink-900">Payer {fullName(employee)}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-ink-100"><X size={18} /></button>
        </div>
        <div className="mb-4 rounded-xl bg-ink-50 p-3 text-sm">
          <div className="flex justify-between"><span className="text-ink-700">Heures impayées</span><span className="font-bold">{hours(summary.unpaidMinutes)}</span></div>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-700">Prix de l&apos;heure (DT)</span>
            <input className="input" autoFocus value={rate} onChange={(e) => setRate(e.target.value)} placeholder="5.500" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-700">Prime (DT)</span>
              <input className="input" value={bonus} onChange={(e) => setBonus(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-700">Retenue (DT)</span>
              <input className="input" value={deduction} onChange={(e) => setDeduction(e.target.value)} />
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-700">Mode de paiement</span>
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              <option value="cash">Espèces</option>
              <option value="transfer">Virement</option>
              <option value="other">Autre</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-700">Note (optionnel)</span>
            <textarea rows={2} className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3">
          <span className="text-sm font-bold text-brand-900">Montant net à payer</span>
          <span className={`text-lg font-black tabular-nums ${finalAmountMinor < 0 ? 'text-rose-600' : 'text-brand-900'}`}>{money(finalAmountMinor)}</span>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-ink-200 px-4 py-2 text-sm font-bold text-ink-700 hover:bg-ink-100">Annuler</button>
          <button onClick={confirm} disabled={saving} className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50">
            {saving ? 'Paiement…' : 'Confirmer le paiement'}
          </button>
        </div>
      </div>
    </div>
  );
}
