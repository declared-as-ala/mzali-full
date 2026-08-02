'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Users, Copy } from 'lucide-react';
import { formatPrice } from '@/lib/site-config';

type CustomerOrder = {
  id: string;
  number: string;
  status: string;
  total: number;
  createdAt: string;
  itemsCount: number;
  thumbnails: string[];
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'En attente', 'en-attente': 'En attente', 'on-hold': 'En attente',
  processing: 'En traitement', confirme: 'Confirmée',
  completed: 'Terminée', cancelled: 'Annulée', annule: 'Annulée',
  refunded: 'Remboursée', failed: 'Échouée', tentative: 'Tentative',
};
const STATUS_TONE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700',
  'en-attente': 'bg-amber-50 text-amber-700',
  'on-hold': 'bg-amber-50 text-amber-700',
  tentative: 'bg-amber-50 text-amber-700',
  processing: 'bg-blue-50 text-blue-700',
  confirme: 'bg-blue-50 text-blue-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-50 text-red-700',
  annule: 'bg-red-50 text-red-700',
  refunded: 'bg-slate-100 text-slate-700',
  failed: 'bg-red-50 text-red-700',
};

export default function CustomerBadge({ phone, label = 'Client régulier' }: { phone: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ total: number; orders: CustomerOrder[] } | null>(null);
  const ref = useRef<HTMLSpanElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
    if (data || loading) return;
    setLoading(true);
    fetch(`/api/admin/customer-orders?phone=${encodeURIComponent(phone)}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData({ total: 0, orders: [] }))
      .finally(() => setLoading(false));
  }
  function scheduleHide() {
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  }
  function cancelHide() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  return (
    <span
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
      className="relative inline-flex"
    >
      <span className="inline-flex cursor-default items-center gap-1 rounded-full bg-brand-100 px-2.5 py-1 text-[11px] font-bold text-brand-700">
        <Users size={12} />
        {label}
      </span>

      {open && (
        <div
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
          className="absolute left-0 top-full z-30 mt-2 w-[340px] rounded-2xl border border-ink-200 bg-white p-4 shadow-2xl"
        >
          <header className="mb-3 flex items-center justify-between">
            <p className="text-sm font-black text-ink-900">
              Commandes totales: <span className="text-brand-500">{loading ? '…' : data?.total ?? 0}</span>
            </p>
            <Link
              href={`/admin/commandes?phone=${encodeURIComponent(phone)}`}
              className="text-xs font-bold text-brand-500 hover:underline"
            >
              Voir commandes
            </Link>
          </header>

          {loading && (
            <div className="grid place-items-center py-6 text-xs text-ink-700">Chargement…</div>
          )}

          {!loading && data && data.orders.length === 0 && (
            <p className="py-4 text-center text-xs text-ink-700">Aucune commande trouvée.</p>
          )}

          {!loading && data && data.orders.length > 0 && (
            <ul className="max-h-72 space-y-2 overflow-auto">
              {data.orders.slice(0, 8).map((o) => {
                const dt = new Date(o.createdAt);
                const tone = STATUS_TONE[o.status] ?? 'bg-ink-100 text-ink-700';
                const lbl = STATUS_LABEL[o.status] ?? o.status;
                return (
                  <li key={o.id} className="rounded-xl border border-dashed border-brand-200 bg-brand-50/40 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-black text-ink-900">#{o.number}</p>
                        <p className="text-[10px] uppercase tracking-wide text-ink-700">
                          {dt.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {o.thumbnails.map((src, i) => (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img key={i} src={src} alt="" className="h-9 w-9 rounded-md object-cover ring-1 ring-ink-200" />
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${tone}`}>
                        {lbl}
                        <button
                          onClick={() => navigator.clipboard?.writeText(o.number)}
                          className="ml-1 rounded p-0.5 hover:bg-black/5"
                          title="Copier le numéro"
                        >
                          <Copy size={9} />
                        </button>
                      </span>
                      <span className="text-sm font-black text-ink-900">{formatPrice(o.total)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </span>
  );
}
