'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Banknote, Download, RefreshCw, Wallet, X } from 'lucide-react';
import { formatDateTime } from '@/lib/site-config';
import { useAdminHref } from '@/lib/admin-nav-context';
import { useToast } from './Toast';

// Hand-kept in sync with backend/src/contracts/attendance.ts (no
// frontend types/ mirror for this isolated domain — see that file's header).
type PayrollUnpaidSummary = {
  employeeId: string; firstName: string; lastName: string; active: boolean; hourlyRateMinor: number;
  unpaidMinutes: number; unpaidAmountMinor: number; periodStart: string | null; periodEnd: string | null; lastPaymentAt: string | null;
};
type PaymentMethod = 'cash' | 'transfer' | 'other';
type PayrollPaymentRecord = {
  id: string; payrollNumber: string; employeeId: string; employeeName: string; totalMinutes: number;
  baseAmountMinor: number; bonusMinor: number; deductionMinor: number; finalAmountMinor: number;
  paymentMethod: PaymentMethod; paidAt: string; paidByName: string; note: string;
};
type PayrollSummary = { totalPaidMinor: number; totalUnpaidMinor: number; paymentCount: number };

const METHOD_LABEL: Record<PaymentMethod, string> = { cash: 'Espèces', transfer: 'Virement', other: 'Autre' };

function hours(minutes: number): string {
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}
function money(minor: number): string {
  return `${(minor / 1000).toFixed(3)} DT`;
}

export default function PaieView() {
  const toast = useToast();
  const adminHref = useAdminHref();
  const [unpaid, setUnpaid] = useState<PayrollUnpaidSummary[]>([]);
  const [payments, setPayments] = useState<PayrollPaymentRecord[]>([]);
  const [summary, setSummary] = useState<PayrollSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<PayrollUnpaidSummary | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, pRes, sRes] = await Promise.all([
        fetch('/api/admin/payroll/unpaid', { cache: 'no-store' }),
        fetch('/api/admin/payroll/payments?perPage=30', { cache: 'no-store' }),
        fetch('/api/admin/payroll/summary', { cache: 'no-store' }),
      ]);
      if (uRes.ok) setUnpaid(await uRes.json());
      if (pRes.ok) {
        const data = await pRes.json();
        setPayments(Array.isArray(data?.items) ? data.items : []);
      }
      if (sRes.ok) setSummary(await sRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink-900">Paie</h1>
          <p className="text-ink-700">Heures impayées et historique des paiements — calculés à partir des sessions de pointage clôturées.</p>
        </div>
        <button onClick={refresh} className="btn-ghost px-3 py-2 text-xs"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualiser</button>
      </header>

      {summary && (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <StatCard icon={Wallet} label="Total payé (tous temps)" value={money(summary.totalPaidMinor)} />
          <StatCard icon={Wallet} label="Total impayé actuellement" value={money(summary.totalUnpaidMinor)} accent={summary.totalUnpaidMinor > 0} />
          <StatCard icon={Banknote} label="Paiements enregistrés" value={String(summary.paymentCount)} />
        </div>
      )}

      <section className="card mb-6 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-ink-900">Heures impayées</h2>
          <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-black text-amber-700">Total : {money(summary?.totalUnpaidMinor ?? unpaid.reduce((sum, u) => sum + u.unpaidAmountMinor, 0))}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-ink-100 text-[11px] font-black uppercase tracking-wide text-ink-700">
              <tr>
                <th className="px-3 py-3">Employé</th>
                <th className="px-3 py-3 text-right">Heures impayées</th>
                <th className="px-3 py-3 text-right">Montant</th>
                <th className="px-3 py-3">Dernier paiement</th>
                <th className="px-3 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {!loading && unpaid.length === 0 && <tr><td colSpan={5} className="px-3 py-10 text-center text-ink-500">Aucune heure impayée.</td></tr>}
              {unpaid.map((u) => (
                <tr key={u.employeeId} className="border-t border-ink-200">
                  <td className="px-3 py-3 font-bold text-ink-900">
                    <Link href={adminHref(`/pointage/${u.employeeId}`)} className="hover:underline">{u.firstName} {u.lastName}</Link>
                    {!u.active && <span className="ml-2 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold text-ink-700">Inactif</span>}
                  </td>
                  <td className="px-3 py-3 text-right font-bold tabular-nums">{hours(u.unpaidMinutes)}</td>
                  <td className="px-3 py-3 text-right font-black tabular-nums text-ink-900">{money(u.unpaidAmountMinor)}</td>
                  <td className="px-3 py-3 text-xs text-ink-700">{u.lastPaymentAt ? formatDateTime(u.lastPaymentAt) : '—'}</td>
                  <td className="px-3 py-3 text-right">
                    <button onClick={() => setPaying(u)} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-600">
                      <Banknote size={13} /> Payer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-4 text-lg font-black text-ink-900">Historique des paiements</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="bg-ink-100 text-[11px] font-black uppercase tracking-wide text-ink-700">
              <tr>
                <th className="px-3 py-3">N°</th>
                <th className="px-3 py-3">Employé</th>
                <th className="px-3 py-3 text-right">Heures</th>
                <th className="px-3 py-3 text-right">Montant net</th>
                <th className="px-3 py-3">Méthode</th>
                <th className="px-3 py-3">Payé le</th>
                <th className="px-3 py-3">Par</th>
                <th className="px-3 py-3 text-right">Fiche</th>
              </tr>
            </thead>
            <tbody>
              {!loading && payments.length === 0 && <tr><td colSpan={8} className="px-3 py-10 text-center text-ink-500">Aucun paiement enregistré.</td></tr>}
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-ink-200">
                  <td className="px-3 py-3 font-bold text-brand-700">{p.payrollNumber}</td>
                  <td className="px-3 py-3 text-ink-900">{p.employeeName}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink-700">{hours(p.totalMinutes)}</td>
                  <td className="px-3 py-3 text-right font-black tabular-nums text-ink-900">{money(p.finalAmountMinor)}</td>
                  <td className="px-3 py-3 text-ink-700">{METHOD_LABEL[p.paymentMethod]}</td>
                  <td className="px-3 py-3 text-xs text-ink-700">{formatDateTime(p.paidAt)}</td>
                  <td className="px-3 py-3 text-xs text-ink-700">{p.paidByName}</td>
                  <td className="px-3 py-3 text-right">
                    <a href={`/api/admin/payroll/payments/${p.id}/pdf`} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-ink-700 hover:bg-ink-100" title="Voir la fiche de paie">
                      <Download size={15} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {paying && (
        <PayModal
          summary={paying}
          onClose={() => setPaying(null)}
          onPaid={() => { setPaying(null); refresh(); }}
          toast={toast}
        />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: typeof Wallet; label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-card ${accent ? 'border-amber-200 bg-amber-50' : 'border-ink-200 bg-white'}`}>
      <Icon size={17} className={accent ? 'text-amber-600' : 'text-brand-500'} aria-hidden="true" />
      <p className="mt-3 text-xl font-black tabular-nums tracking-tight text-ink-900">{value}</p>
      <p className="mt-1 text-xs font-bold text-ink-500">{label}</p>
    </div>
  );
}

function PayModal({ summary, onClose, onPaid, toast }: {
  summary: PayrollUnpaidSummary;
  onClose: () => void;
  onPaid: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [bonus, setBonus] = useState('0');
  const [deduction, setDeduction] = useState('0');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const bonusMinor = Math.max(0, Math.round((Number.parseFloat(bonus.replace(',', '.')) || 0) * 1000));
  const deductionMinor = Math.max(0, Math.round((Number.parseFloat(deduction.replace(',', '.')) || 0) * 1000));
  const finalAmountMinor = summary.unpaidAmountMinor + bonusMinor - deductionMinor;

  async function confirm() {
    if (finalAmountMinor < 0) { toast.error('Le montant final ne peut pas être négatif.'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/payroll/employees/${summary.employeeId}/pay`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bonusMinor, deductionMinor, paymentMethod: method, note: note.trim() || undefined }),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black text-ink-900">Payer {summary.firstName} {summary.lastName}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-ink-100"><X size={18} /></button>
        </div>
        <div className="mb-4 rounded-xl bg-ink-50 p-3 text-sm">
          <div className="flex justify-between"><span className="text-ink-700">Heures impayées</span><span className="font-bold">{hours(summary.unpaidMinutes)}</span></div>
          <div className="flex justify-between"><span className="text-ink-700">Montant de base</span><span className="font-bold">{money(summary.unpaidAmountMinor)}</span></div>
        </div>
        <div className="space-y-3">
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
