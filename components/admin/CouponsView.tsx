'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Tag, Trash2, Edit, Plus, Power } from 'lucide-react';
import { useToast } from './Toast';
import type { Coupon } from '@/types/coupon';

const emptyForm = {
  code: '', type: 'percent' as 'percent' | 'fixed', value: 10,
  minSubtotal: '', usageLimit: '', perPhoneLimit: '', active: true,
};

export default function CouponsView({ initial }: { initial: Coupon[] }) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [form, setForm] = useState(emptyForm);

  function openCreate() { setEditing(null); setForm(emptyForm); setOpen(true); }
  function openEdit(c: Coupon) {
    setEditing(c);
    setForm({
      code: c.code, type: c.type, value: c.value,
      minSubtotal: c.minSubtotal != null ? String(c.minSubtotal) : '',
      usageLimit: c.usageLimit != null ? String(c.usageLimit) : '',
      perPhoneLimit: c.perPhoneLimit != null ? String(c.perPhoneLimit) : '',
      active: c.active,
    });
    setOpen(true);
  }

  async function save() {
    const body = {
      code: form.code.trim().toUpperCase(),
      type: form.type,
      value: Number(form.value),
      minSubtotal: form.minSubtotal ? Number(form.minSubtotal) : null,
      usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
      perPhoneLimit: form.perPhoneLimit ? Number(form.perPhoneLimit) : null,
      active: form.active,
    };
    const url = editing ? `/api/admin/coupons/${editing.id}` : '/api/admin/coupons';
    const method = editing ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(data?.error ?? 'Erreur'); return; }
    toast.success(editing ? 'Code promo mis à jour' : 'Code promo créé');
    setOpen(false);
    startTransition(() => router.refresh());
  }

  async function toggleActive(c: Coupon) {
    const res = await fetch(`/api/admin/coupons/${c.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !c.active }),
    });
    if (!res.ok) { toast.error('Erreur'); return; }
    startTransition(() => router.refresh());
  }

  async function remove(c: Coupon) {
    if (!confirm(`Supprimer le code « ${c.code} » ?`)) return;
    const res = await fetch(`/api/admin/coupons/${c.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Erreur de suppression'); return; }
    toast.success('Code promo supprimé');
    startTransition(() => router.refresh());
  }

  return (
    <div className="p-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-black">Codes promo</h1>
        <button onClick={openCreate} className="btn-primary inline-flex items-center gap-2">
          <Plus size={16} /> Ajouter un code
        </button>
      </header>

      <div className="overflow-hidden rounded-2xl bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-100 text-xs font-black uppercase text-ink-700">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Valeur</th>
              <th className="px-4 py-3">Utilisation</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {initial.map((c) => (
              <tr key={c.id} className="border-t border-ink-200">
                <td className="px-4 py-3 font-black">
                  <span className="inline-flex items-center gap-2"><Tag size={14} className="text-brand-500" /> {c.code}</span>
                </td>
                <td className="px-4 py-3">{c.type === 'percent' ? `${c.value}%` : `${c.value} DT`}</td>
                <td className="px-4 py-3 text-ink-700">
                  {c.usageCount}{c.usageLimit != null ? ` / ${c.usageLimit}` : ''}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${c.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {c.active ? 'Actif' : 'Inactif'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => toggleActive(c)} className="rounded-lg p-2 text-ink-700 hover:bg-ink-100" title={c.active ? 'Désactiver' : 'Activer'}>
                      <Power size={16} />
                    </button>
                    <button onClick={() => openEdit(c)} className="rounded-lg p-2 text-ink-700 hover:bg-ink-100" title="Modifier"><Edit size={16} /></button>
                    <button onClick={() => remove(c)} className="rounded-lg p-2 text-red-500 hover:bg-red-50" title="Supprimer"><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!initial.length && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-ink-700">Aucun code promo.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-xl font-black">{editing ? 'Modifier le code' : 'Ajouter un code promo'}</h2>
            <div className="space-y-3">
              <label className="block text-sm font-bold">Code
                <input className="input mt-1 uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-bold">Type
                  <select className="input mt-1" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'percent' | 'fixed' })}>
                    <option value="percent">Pourcentage</option>
                    <option value="fixed">Montant fixe (DT)</option>
                  </select>
                </label>
                <label className="block text-sm font-bold">Valeur
                  <input type="number" className="input mt-1" value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} />
                </label>
              </div>
              <label className="block text-sm font-bold">Sous-total minimum (DT, optionnel)
                <input type="number" className="input mt-1" value={form.minSubtotal} onChange={(e) => setForm({ ...form, minSubtotal: e.target.value })} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-bold">Limite d&apos;utilisation
                  <input type="number" className="input mt-1" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} />
                </label>
                <label className="block text-sm font-bold">Limite par client
                  <input type="number" className="input mt-1" value={form.perPhoneLimit} onChange={(e) => setForm({ ...form, perPhoneLimit: e.target.value })} />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm font-bold">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Actif
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="btn-ghost">Annuler</button>
              <button onClick={save} className="btn-primary">Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
