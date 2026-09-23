'use client';
import { useEffect, useMemo, useState } from 'react';
import { Plus, Edit, KeyRound, Power, Search, X } from 'lucide-react';
import { useToast } from './Toast';

type AttendanceEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  jobTitle: string;
  hourlyRateMinor: number;
  active: boolean;
  hiredAt: string | null;
  notes: string;
};

function dtFromMinor(minor: number): string {
  return (minor / 1000).toFixed(3);
}
function minorFromDt(dt: string): number {
  const n = Number.parseFloat(dt.replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 1000) : 0;
}

const EMPTY_FORM = { firstName: '', lastName: '', phone: '', email: '', jobTitle: '', hourlyRate: '', pin: '', active: true, hiredAt: '', notes: '' };

export default function PointageEmployesView() {
  const toast = useToast();
  const [rows, setRows] = useState<AttendanceEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AttendanceEmployee | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [resetPinFor, setResetPinFor] = useState<AttendanceEmployee | null>(null);
  const [resetPinValue, setResetPinValue] = useState('');

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/pointage-employes', { cache: 'no-store' });
      const data = await res.json();
      if (Array.isArray(data)) setRows(data);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.firstName} ${r.lastName} ${r.phone} ${r.jobTitle}`.toLowerCase().includes(q));
  }, [rows, query]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }
  function openEdit(e: AttendanceEmployee) {
    setEditing(e);
    setForm({
      firstName: e.firstName, lastName: e.lastName, phone: e.phone, email: e.email ?? '',
      jobTitle: e.jobTitle, hourlyRate: dtFromMinor(e.hourlyRateMinor), pin: '',
      active: e.active, hiredAt: e.hiredAt ? e.hiredAt.slice(0, 10) : '', notes: e.notes,
    });
    setModalOpen(true);
  }

  async function save() {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.phone.trim()) {
      toast.error('Nom, prénom et téléphone sont obligatoires.');
      return;
    }
    if (!editing && !/^\d{4,6}$/.test(form.pin)) {
      toast.error('Le code PIN doit contenir 4 à 6 chiffres.');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        jobTitle: form.jobTitle.trim() || undefined,
        hourlyRateMinor: minorFromDt(form.hourlyRate || '0'),
        active: form.active,
        hiredAt: form.hiredAt || undefined,
        notes: form.notes.trim() || undefined,
      };
      if (!editing) payload.pin = form.pin;
      const url = editing ? `/api/admin/pointage-employes/${editing.id}` : '/api/admin/pointage-employes';
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? 'Erreur');
      toast.success(editing ? 'Employé modifié.' : 'Employé créé.');
      setModalOpen(false);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(e: AttendanceEmployee) {
    try {
      const res = await fetch(`/api/admin/pointage-employes/${e.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !e.active }),
      });
      if (!res.ok) throw new Error('Erreur');
      toast.success(e.active ? `${e.firstName} désactivé.` : `${e.firstName} activé.`);
      refresh();
    } catch {
      toast.error('Erreur');
    }
  }

  async function confirmResetPin() {
    if (!resetPinFor || !/^\d{4,6}$/.test(resetPinValue)) {
      toast.error('Le code PIN doit contenir 4 à 6 chiffres.');
      return;
    }
    try {
      const res = await fetch(`/api/admin/pointage-employes/${resetPinFor.id}/reset-pin`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: resetPinValue }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? 'Erreur');
      toast.success('Code PIN réinitialisé.');
      setResetPinFor(null);
      setResetPinValue('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-ink-900">Personnel (Pointage)</h1>
          <p className="text-xs text-ink-700">Employés suivis pour le pointage — indépendant des comptes Admin/Caisse.</p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600">
          <Plus size={16} /> Ajouter un employé
        </button>
      </div>

      <div className="card flex items-center gap-2 p-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-700" />
          <input className="input pl-9" placeholder="Rechercher…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-ink-100 text-[10px] uppercase tracking-wider text-ink-700">
            <tr>
              <th className="px-4 py-3 text-left font-bold">Employé</th>
              <th className="px-3 py-3 text-left font-bold">Poste</th>
              <th className="px-3 py-3 text-left font-bold">Téléphone</th>
              <th className="px-3 py-3 text-right font-bold">Tarif horaire</th>
              <th className="px-3 py-3 text-center font-bold">Statut</th>
              <th className="px-3 py-3 text-right font-bold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-3 py-10 text-center text-ink-700">Chargement…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-ink-700">Aucun employé.</td></tr>}
            {!loading && filtered.map((e) => (
              <tr key={e.id} className="border-t border-ink-200">
                <td className="px-4 py-3 font-bold text-ink-900">{e.firstName} {e.lastName}</td>
                <td className="px-3 py-3 text-ink-700">{e.jobTitle || '—'}</td>
                <td className="px-3 py-3 text-ink-700">{e.phone}</td>
                <td className="px-3 py-3 text-right font-bold">{dtFromMinor(e.hourlyRateMinor)} DT/h</td>
                <td className="px-3 py-3 text-center">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${e.active ? 'bg-emerald-50 text-emerald-700' : 'bg-ink-100 text-ink-700'}`}>
                    {e.active ? 'Actif' : 'Inactif'}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(e)} className="rounded-lg p-2 text-ink-700 hover:bg-ink-100" title="Modifier"><Edit size={15} /></button>
                    <button onClick={() => { setResetPinFor(e); setResetPinValue(''); }} className="rounded-lg p-2 text-ink-700 hover:bg-ink-100" title="Réinitialiser le PIN"><KeyRound size={15} /></button>
                    <button onClick={() => toggleActive(e)} className={`rounded-lg p-2 hover:bg-ink-100 ${e.active ? 'text-amber-600' : 'text-emerald-600'}`} title={e.active ? 'Désactiver' : 'Activer'}><Power size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setModalOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black text-ink-900">{editing ? 'Modifier l\'employé' : 'Nouvel employé'}</h2>
              <button onClick={() => setModalOpen(false)} className="rounded-lg p-1.5 hover:bg-ink-100"><X size={18} /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Prénom"><input className="input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
              <Field label="Nom"><input className="input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
              <Field label="Téléphone"><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
              <Field label="Email (optionnel)"><input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Poste / rôle"><input className="input" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} placeholder="Vendeur" /></Field>
              <Field label="Tarif horaire (DT/h)"><input className="input" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} placeholder="5.500" /></Field>
              {!editing && (
                <Field label="Code PIN (4-6 chiffres)"><input className="input" maxLength={6} value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })} placeholder="4821" /></Field>
              )}
              <Field label="Date d'embauche (optionnel)"><input type="date" className="input" value={form.hiredAt} onChange={(e) => setForm({ ...form, hiredAt: e.target.value })} /></Field>
              <Field label="Statut" className="sm:col-span-2">
                <label className="flex items-center gap-2 text-sm font-bold text-ink-900">
                  <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                  Actif
                </label>
              </Field>
              <Field label="Notes (optionnel)" className="sm:col-span-2"><textarea rows={2} className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setModalOpen(false)} className="rounded-xl border border-ink-200 px-4 py-2 text-sm font-bold text-ink-700 hover:bg-ink-100">Annuler</button>
              <button onClick={save} disabled={saving} className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50">
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {resetPinFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setResetPinFor(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-lg font-black text-ink-900">Réinitialiser le PIN</h2>
            <p className="mb-4 text-xs text-ink-700">{resetPinFor.firstName} {resetPinFor.lastName} — l&apos;ancien code ne peut pas être récupéré, uniquement remplacé.</p>
            <Field label="Nouveau code PIN (4-6 chiffres)">
              <input className="input" maxLength={6} value={resetPinValue} onChange={(e) => setResetPinValue(e.target.value.replace(/\D/g, ''))} placeholder="4821" />
            </Field>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setResetPinFor(null)} className="rounded-xl border border-ink-200 px-4 py-2 text-sm font-bold text-ink-700 hover:bg-ink-100">Annuler</button>
              <button onClick={confirmResetPin} className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600">Confirmer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-700">{label}</span>
      {children}
    </label>
  );
}
