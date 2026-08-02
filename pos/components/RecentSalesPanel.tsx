'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Edit, Eye, Printer, Receipt, Trash2 } from 'lucide-react';
import { posFetch } from '@/lib/device';
import { formatMinor } from '@/lib/money';
import type { PosSale, PosSalesListResponse } from '@/types/pos';

const STATUS_LABEL: Record<string, string> = { COMPLETED: 'Complétée', SUSPENDED: 'Suspendue', REFUNDED: 'Remboursée', CANCELLED: 'Annulée' };
const STATUS_TONE: Record<string, string> = {
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  SUSPENDED: 'bg-amber-50 text-amber-700 border-amber-200',
  REFUNDED: 'bg-blue-50 text-blue-700 border-blue-200',
  CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200',
};
const PAYMENT_LABEL: Record<string, string> = { CASH: 'Espèces', CARD: 'Carte', MIXED: 'Mixte', OTHER: 'Autre' };

export const DUPLICATE_CART_KEY = 'pos_duplicate_sale_lines';

export default function RecentSalesPanel({ onOpen, onPrint }: {
  onOpen: (sale: PosSale) => void;
  onPrint: (sale: PosSale) => void;
}) {
  const router = useRouter();
  const [sales, setSales] = useState<PosSale[] | null>(null);
  const [loading, setLoading] = useState(true);

  function loadRecent() {
    setLoading(true);
    posFetch('/api/sales?perPage=6', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: PosSalesListResponse) => setSales(data.items ?? []))
      .catch(() => setSales([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadRecent();
  }, []);

  function duplicate(sale: PosSale) {
    localStorage.setItem(DUPLICATE_CART_KEY, JSON.stringify(sale.lines.map((l) => ({ variantId: l.variantId, qty: l.qty }))));
    router.push('/till');
  }

  async function handleDelete(sale: PosSale) {
    if (!confirm(`Voulez-vous vraiment annuler/supprimer la vente #${sale.saleNumber} ? Le stock sera réintégré.`)) return;
    try {
      const res = await posFetch(`/api/sales/${sale.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Impossible d’annuler la vente');
      loadRecent();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur');
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-black text-slate-900">
          <Receipt size={16} className="text-blue-600" /> Ventes récentes
        </h2>
        <button onClick={() => router.push('/history')} className="text-xs font-bold text-blue-600 hover:underline">
          Voir tout l&apos;historique →
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>
      ) : !sales?.length ? (
        <div className="grid h-32 place-items-center rounded-2xl border-2 border-dashed border-slate-200 text-center">
          <p className="text-xs font-bold text-slate-400">Aucune vente pour le moment.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                <th className="pb-2">Ticket</th>
                <th className="pb-2">Date</th>
                <th className="pb-2">Paiement</th>
                <th className="pb-2">Statut</th>
                <th className="pb-2 text-right">Total</th>
                <th className="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 font-black text-blue-700 cursor-pointer" onClick={() => onOpen(s)}>#{s.saleNumber}</td>
                  <td className="py-2.5 text-slate-500">{new Date(s.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="py-2.5 text-slate-500">{PAYMENT_LABEL[s.paymentMethod ?? 'OTHER']}</td>
                  <td className="py-2.5">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${STATUS_TONE[s.status]}`}>{STATUS_LABEL[s.status] ?? s.status}</span>
                  </td>
                  <td className="py-2.5 text-right font-black text-slate-900">{formatMinor(s.totalMinor)}</td>
                  <td className="py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => {
                          localStorage.setItem('pos_edit_sale', JSON.stringify({ id: s.id, saleNumber: s.saleNumber, lines: s.lines }));
                          router.push('/till');
                        }}
                        title="Modifier en Caisse"
                        className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-blue-100 hover:text-blue-700 transition"
                      >
                        <Edit size={14} />
                      </button>
                      <button onClick={() => onPrint(s)} title="Réimprimer" className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-900">
                        <Printer size={14} />
                      </button>
                      <button
                        disabled={s.status === 'CANCELLED'}
                        onClick={() => handleDelete(s)}
                        title="Annuler / Supprimer"
                        className="grid h-7 w-7 place-items-center rounded-lg text-rose-500 hover:bg-rose-100 hover:text-rose-700 disabled:opacity-30"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
