'use client';
import { useEffect, useState } from 'react';
import { AlertTriangle, PackageX, RefreshCw } from 'lucide-react';

type Alert = {
  id: string; type: 'low_stock' | 'out_of_stock'; variantId: string; locationId: string;
  productId: string; productName: string; available: number; threshold: number;
  negativeStock: boolean; createdAt: string; updatedAt: string;
};

export default function StockAlertsView() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/inventory/alerts', { cache: 'no-store' });
      const data = await res.json().catch(() => []);
      setAlerts(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);

  const negative = alerts.filter((a) => a.negativeStock);
  const outOfStock = alerts.filter((a) => !a.negativeStock && a.type === 'out_of_stock');
  const lowStock = alerts.filter((a) => !a.negativeStock && a.type === 'low_stock');

  return (
    <div className="p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black">Alertes stock</h1>
          <p className="text-ink-700">Stock bas, ruptures et écarts négatifs détectés par la vérification automatique.</p>
        </div>
        <button onClick={refresh} className="btn-ghost inline-flex items-center gap-2">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualiser
        </button>
      </header>

      {negative.length > 0 && (
        <Section title="Stock négatif" icon={<PackageX size={16} />} tone="red" items={negative} />
      )}
      <Section title="Rupture de stock" icon={<AlertTriangle size={16} />} tone="amber" items={outOfStock} />
      <Section title="Stock bas" icon={<AlertTriangle size={16} />} tone="ink" items={lowStock} />

      {!loading && !alerts.length && (
        <p className="rounded-2xl bg-white p-10 text-center text-ink-700 shadow-card">Aucune alerte active — tout va bien.</p>
      )}
    </div>
  );
}

function Section({ title, icon, tone, items }: { title: string; icon: React.ReactNode; tone: 'red' | 'amber' | 'ink'; items: Alert[] }) {
  if (!items.length) return null;
  const toneClass = tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-ink-700';
  return (
    <div className="mb-6">
      <h2 className={`mb-2 flex items-center gap-2 text-sm font-black uppercase ${toneClass}`}>{icon} {title} ({items.length})</h2>
      <div className="overflow-hidden rounded-2xl bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-100 text-xs font-black uppercase text-ink-700">
            <tr><th className="px-4 py-3">Produit</th><th className="px-4 py-3">Emplacement</th><th className="px-4 py-3">Disponible</th><th className="px-4 py-3">Seuil</th><th className="px-4 py-3">Depuis</th></tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id} className="border-t border-ink-200">
                <td className="px-4 py-3 font-bold text-ink-900">{a.productName}</td>
                <td className="px-4 py-3 text-ink-700">{a.locationId}</td>
                <td className={`px-4 py-3 font-black ${a.available < 0 ? 'text-red-600' : 'text-ink-900'}`}>{a.available}</td>
                <td className="px-4 py-3 text-ink-700">{a.threshold}</td>
                <td className="px-4 py-3 text-ink-500">{new Date(a.createdAt).toLocaleDateString('fr-TN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
