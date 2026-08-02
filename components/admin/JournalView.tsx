'use client';
import { useState } from 'react';
import { ScrollText, Filter } from 'lucide-react';
import type { AuditLogEntry } from '@/types/audit';

export default function JournalView({ initial }: { initial: AuditLogEntry[] }) {
  const [items, setItems] = useState(initial);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(false);

  async function applyFilters() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ perPage: '50' });
      if (entityType) params.set('entityType', entityType);
      if (action) params.set('action', action);
      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`);
      const data = await res.json();
      setItems(res.ok ? data.items : []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-3xl font-black">Journal d&apos;audit</h1>
      </header>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm font-bold">Type d&apos;entité
          <input className="input mt-1" placeholder="order, product, employee..." value={entityType} onChange={(e) => setEntityType(e.target.value)} />
        </label>
        <label className="text-sm font-bold">Action
          <input className="input mt-1" placeholder="order.status_change..." value={action} onChange={(e) => setAction(e.target.value)} />
        </label>
        <button onClick={applyFilters} disabled={loading} className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
          <Filter size={16} /> Filtrer
        </button>
      </div>

      <ul className="space-y-2">
        {items.map((entry) => (
          <li key={entry.id} className="card p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-lg bg-brand-100 text-brand-600">
                <ScrollText size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{entry.summary}</p>
                <p className="mt-0.5 text-xs text-ink-700">
                  {entry.actor.name} · {entry.action} · {entry.entityType}
                  {entry.entityId ? ` #${entry.entityId.slice(-6)}` : ''} · {new Date(entry.createdAt).toLocaleString('fr-FR')}
                </p>
              </div>
            </div>
          </li>
        ))}
        {!items.length && <p className="p-8 text-center text-ink-700">Aucune entrée.</p>}
      </ul>
    </div>
  );
}
