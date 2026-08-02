'use client';
import { useEffect, useState } from 'react';
import { Check, MonitorSmartphone, RefreshCw, ShieldOff } from 'lucide-react';
import { useToast } from './Toast';

type PosTerminal = {
  id: string;
  terminalCode: string;
  name: string;
  locationId: string;
  active: boolean;
  pairingCode: string | null;
  lastSeenAt: string | null;
  createdAt: string;
};

export default function PosTerminalsView() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PosTerminal[]>([]);
  const [approved, setApproved] = useState<PosTerminal[]>([]);

  async function refresh() {
    setLoading(true);
    try {
      const [pendingRes, allRes] = await Promise.all([
        fetch('/api/admin/pos/terminals/pending', { cache: 'no-store' }),
        fetch('/api/admin/pos/terminals', { cache: 'no-store' }),
      ]);
      const pendingData: PosTerminal[] = pendingRes.ok ? await pendingRes.json() : [];
      const allData: PosTerminal[] = allRes.ok ? await allRes.json() : [];
      setPending(pendingData);
      setApproved(allData.filter((t) => t.active));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);

  async function approve(t: PosTerminal) {
    const name = window.prompt('Nom de ce terminal (ex: Caisse 1)', t.name === 'Nouveau terminal' ? '' : t.name);
    if (name === null) return;
    const res = await fetch(`/api/admin/pos/terminals/${t.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name || undefined }),
    });
    if (!res.ok) { toast.error('Erreur'); return; }
    toast.success('Terminal approuvé');
    refresh();
  }

  async function revoke(t: PosTerminal) {
    if (!window.confirm(`Révoquer l'accès du terminal « ${t.name} » ?`)) return;
    const res = await fetch(`/api/admin/pos/terminals/${t.id}/revoke`, { method: 'POST' });
    if (!res.ok) { toast.error('Erreur'); return; }
    toast.success('Terminal révoqué');
    refresh();
  }

  return (
    <div className="p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black">Terminaux POS</h1>
          <p className="text-ink-700">Approuvez les caisses avant qu&apos;elles puissent vendre.</p>
        </div>
        <button onClick={refresh} className="btn-ghost inline-flex items-center gap-2">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualiser
        </button>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-ink-700">
          En attente d&apos;approbation {pending.length > 0 && `(${pending.length})`}
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-ink-700">Aucun terminal en attente.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pending.map((t) => (
              <div key={t.id} className="card p-5">
                <div className="mb-3 flex items-center gap-2">
                  <MonitorSmartphone size={18} className="text-brand-500" />
                  <span className="font-black text-ink-900">{t.terminalCode}</span>
                </div>
                {t.pairingCode && (
                  <p className="mb-3 text-2xl font-black tracking-widest text-brand-600">{t.pairingCode}</p>
                )}
                <button onClick={() => approve(t)} className="btn-primary w-full inline-flex items-center justify-center gap-2">
                  <Check size={14} /> Approuver
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-ink-700">Terminaux actifs</h2>
        {approved.length === 0 ? (
          <p className="text-sm text-ink-700">Aucun terminal actif.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-card">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink-100 text-xs font-black uppercase text-ink-700">
                <tr>
                  <th className="px-4 py-3">Nom</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Emplacement</th>
                  <th className="px-4 py-3">Dernière activité</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {approved.map((t) => (
                  <tr key={t.id} className="border-t border-ink-200">
                    <td className="px-4 py-3 font-bold">{t.name}</td>
                    <td className="px-4 py-3 text-ink-700">{t.terminalCode}</td>
                    <td className="px-4 py-3 text-ink-700">{t.locationId}</td>
                    <td className="px-4 py-3 text-ink-700">
                      {t.lastSeenAt ? new Date(t.lastSeenAt).toLocaleString('fr-FR') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => revoke(t)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50">
                        <ShieldOff size={13} /> Révoquer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
