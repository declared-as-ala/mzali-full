'use client';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Edit, Trash2, Search, X, Check, AlertCircle } from 'lucide-react';
import { useToast } from './Toast';
import type { Employee } from '@/services';

type EmployeeRow = Employee;

export default function EmployeesView() {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [query, setQuery] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeRow | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/employees', { cache: 'no-store' });
      const data = await res.json();
      if (Array.isArray(data)) setRows(data);
    } finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.name} ${r.email}`.toLowerCase().includes(q));
  }, [rows, query]);

  function openCreate() { setEditing(null); setDrawerOpen(true); }
  function openEdit(e: EmployeeRow) { setEditing(e); setDrawerOpen(true); }

  async function toggleActive(e: EmployeeRow) {
    const next = !e.active;
    try {
      const res = await fetch(`/api/admin/employees/${e.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? 'Erreur');
      toast.success(next ? `${e.name} activé` : `${e.name} désactivé`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function deleteEmployee(e: EmployeeRow) {
    if (!confirm(`Supprimer définitivement l'employé ${e.name} ? Cette action est irréversible.`)) return;
    try {
      const res = await fetch(`/api/admin/employees/${e.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? 'Erreur lors de la suppression');
      toast.success(`${e.name} supprimé`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  }

  function onSaved(saved: EmployeeRow) {
    setRows((current) => {
      const exists = current.some((employee) => employee.id === saved.id);
      if (!exists) return [...current, saved];
      return current.map((employee) => employee.id === saved.id
        ? { ...employee, ...saved }
        : employee);
    });
    setDrawerOpen(false);
    void refresh();
    startTransition(() => router.refresh());
  }

  return (
    <div className="p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black">Employés</h1>
          <p className="text-ink-700">{rows.length} compte{rows.length > 1 ? 's' : ''}</p>
        </div>
        <button onClick={openCreate} className="btn-primary inline-flex items-center gap-2">
          <Plus size={16} /> Ajouter un employé
        </button>
      </header>

      <div className="mb-4 relative max-w-md">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-700" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher (nom, email)…"
          className="input pl-9"
        />
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-700 hover:bg-ink-100"><X size={14} /></button>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-ink-100 text-xs uppercase text-ink-700">
            <tr>
              <th className="px-4 py-3 text-left">Nom</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Rôle</th>
              <th className="px-4 py-3 text-left">Statut</th>
              <th className="px-4 py-3 text-left">Créé</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="p-6 text-center text-ink-700">Chargement…</td></tr>}
            {!loading && filtered.map((e) => {
              const r = e.role ?? 'employee';
              const isAdmin = r === 'admin' || r === 'super_admin';
              return (
                <tr key={e.id} className={`border-t border-ink-200 hover:bg-ink-100 ${pending ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 font-bold">{e.name}</td>
                  <td className="px-4 py-3 text-ink-700">{e.email}</td>
                  <td className="px-4 py-3">
                    {isAdmin ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-bold text-purple-700 border border-purple-200">
                        👑 Administrateur
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 border border-blue-200">
                        💳 Employé (Accès POS Caisse)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {e.active ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700"><Check size={12} /> Actif</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-700"><AlertCircle size={12} /> Inactif</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-700">{new Date(e.createdAt).toLocaleDateString('fr-FR')}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => toggleActive(e)} className="rounded-lg p-2 text-ink-700 hover:bg-ink-100" title={e.active ? 'Désactiver' : 'Activer'}>
                        {e.active ? <AlertCircle size={16} /> : <Check size={16} />}
                      </button>
                      <button onClick={() => openEdit(e)} className="rounded-lg p-2 text-ink-700 hover:bg-ink-100" title="Modifier"><Edit size={16} /></button>
                      <button onClick={() => deleteEmployee(e)} className="rounded-lg p-2 text-red-500 hover:bg-red-50" title="Supprimer"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && !filtered.length && (
              <tr><td colSpan={7} className="p-8 text-center text-ink-700">{rows.length === 0 ? 'Aucun employé.' : 'Aucun résultat.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {drawerOpen && (
        <EmployeeFormModal
          initial={editing}
          onClose={() => setDrawerOpen(false)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

function EmployeeFormModal({
  initial, onClose, onSaved,
}: {
  initial: EmployeeRow | null;
  onClose: () => void;
  onSaved: (employee: EmployeeRow) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [role, setRole] = useState(initial?.role ?? 'employee');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [active, setActive] = useState(initial?.active ?? true);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || !email.trim()) { toast.error('Nom et email requis'); return; }
    if (password && password !== confirmPw) { toast.error('Les mots de passe ne correspondent pas'); return; }
    if (!initial && (!password || password.length < 6)) { toast.error('Mot de passe min 6 caractères'); return; }

    setSaving(true);
    try {
      const url = initial ? `/api/admin/employees/${initial.id}` : '/api/admin/employees';
      const method = initial ? 'PATCH' : 'POST';
      const body: Record<string, unknown> = { name, email, role, active };
      if (password) body.password = password;
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? 'Erreur');
      if (!data?.id || data.role !== role) {
        throw new Error("Le serveur n'a pas confirmé le nouveau rôle. Veuillez réessayer.");
      }
      const roleChanged = Boolean(initial && (initial.role ?? 'employee') !== data.role);
      toast.success(roleChanged
        ? "Employé mis à jour. Le nouvel accès sera actif à sa prochaine connexion."
        : initial ? 'Employé mis à jour' : 'Employé créé');
      onSaved(data as EmployeeRow);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-black">{initial ? 'Modifier l\'employé' : 'Ajouter un employé'}</h2>
        <div className="space-y-3">
          <label className="block text-sm font-bold">Nom
            <input className="input mt-1 font-normal" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block text-sm font-bold">Email
            <input type="email" className="input mt-1 font-normal" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block text-sm font-bold">Rôle & Accès
            <select
              className="input mt-1 cursor-pointer font-semibold"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="employee">💳 Employé — Gestion Commandes Admin & Accès Caisse POS</option>
              <option value="admin">👑 Administrateur — Accès total Admin & POS</option>
            </select>
          </label>
          <label className="block text-sm font-bold">
            Mot de passe {initial && <span className="font-normal text-ink-700">(laisser vide pour ne pas changer)</span>}
            <input type="password" className="input mt-1 font-normal" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 caractères" />
          </label>
          <label className="block text-sm font-bold">Confirmer
            <input type="password" className="input mt-1 font-normal" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
          </label>
          <label className="inline-flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Compte actif
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Annuler</button>
          <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
