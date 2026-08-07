'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Copy, Edit, Eye, History, Loader2, Printer, Search, Trash2 } from 'lucide-react';
import { posFetch } from '@/lib/device';
import { DEFAULT_PRINTER_SETTINGS, printReceiptOnBridge, reportPrintStatus } from '@/lib/hardware';
import { formatMinor } from '@/lib/money';
import type { PosPrinterSettings, PosSale, PosSalesListResponse } from '@/types/pos';
import NavBar from './NavBar';
import type { PrintFormat } from './PrintMenu';
import PrintPreview from './PrintPreview';
import SaleDrawer from './SaleDrawer';
import { DUPLICATE_CART_KEY } from './RecentSalesPanel';

const STATUS_LABEL: Record<string, string> = { COMPLETED: 'Complétée', SUSPENDED: 'Suspendue', REFUNDED: 'Remboursée', CANCELLED: 'Annulée' };
const STATUS_TONE: Record<string, string> = {
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  SUSPENDED: 'bg-amber-50 text-amber-700 border-amber-200',
  REFUNDED: 'bg-blue-50 text-blue-700 border-blue-200',
  CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function HistoryView({ canEdit }: { canEdit: boolean }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PosSalesListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [openSale, setOpenSale] = useState<PosSale | null>(null);
  const [initialEdit, setInitialEdit] = useState(false);
  const [printJob, setPrintJob] = useState<{ sale: PosSale; format: PrintFormat } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [printerSettings, setPrinterSettings] = useState<PosPrinterSettings>(DEFAULT_PRINTER_SETTINGS);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [reprintFeedback, setReprintFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    posFetch('/api/printer/settings', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Partial<PosPrinterSettings> | null) => { if (data) setPrinterSettings({ ...DEFAULT_PRINTER_SETTINGS, ...data }); })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!reprintFeedback) return;
    const id = setTimeout(() => setReprintFeedback(null), 3000);
    return () => clearTimeout(id);
  }, [reprintFeedback]);

  // The one-click printer icon tries a silent bridge reprint first — same as
  // a fresh sale — and only falls back to the on-screen preview (manual,
  // cashier-initiated browser printing) if the bridge is unreachable or the
  // print itself fails. Never touches the sale; only its printStatus.
  async function handleReprint(s: PosSale) {
    if (printingId) return;
    setPrintingId(s.id);
    setReprintFeedback(null);
    try {
      await printReceiptOnBridge(s, printerSettings);
      await reportPrintStatus(s.id, 'printed');
      setReprintFeedback({ tone: 'success', message: `Ticket #${s.saleNumber} imprimé.` });
    } catch (error) {
      await reportPrintStatus(s.id, 'failed');
      setReprintFeedback({
        tone: 'error',
        message: error instanceof Error ? `Impression automatique indisponible : ${error.message}` : 'Impression automatique indisponible.',
      });
      setPrintJob({ sale: s, format: 'receipt' });
    } finally {
      setPrintingId(null);
    }
  }

  function loadSales() {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), perPage: '20' });
    if (search.trim()) params.set('search', search.trim());
    if (status) params.set('status', status);
    posFetch(`/api/sales?${params.toString()}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then(setData)
      .catch(() => setData({ items: [], total: 0, page: 1, perPage: 20 }))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadSales();
  }, [search, status, page]);

  async function handleDelete(s: PosSale) {
    if (!confirm(`Voulez-vous vraiment annuler/supprimer le ticket #${s.saleNumber} ? Le stock sera réintégré.`)) return;
    setDeletingId(s.id);
    try {
      const res = await posFetch(`/api/sales/${s.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Impossible d’annuler la vente');
      loadSales();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setDeletingId(null);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;

  return (
    <div className="flex h-screen flex-col bg-[#F4F6F9] text-slate-900 select-none">
      <header className="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-2.5 shadow-xs">
        <div className="flex items-center gap-3.5">
          <NavBar />
          <h1 className="hidden text-sm font-black text-slate-700 sm:block">Historique des commandes POS</h1>
        </div>
      </header>

      {reprintFeedback && (
        <div
          role="status"
          className={`flex flex-none items-center px-6 py-2 text-xs font-bold ${reprintFeedback.tone === 'success' ? 'border-b border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-b border-rose-200 bg-rose-50 text-rose-800'}`}
        >
          {reprintFeedback.message}
        </div>
      )}

      <main className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <div className="card flex flex-wrap items-center gap-3 p-4">
          <div className="flex flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 min-w-[220px]">
            <Search size={15} className="text-slate-400" />
            <input
              className="flex-1 bg-transparent text-xs font-semibold outline-none placeholder:text-slate-400"
              placeholder="Rechercher un ticket, produit, SKU…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="input w-auto py-2.5 text-xs">
            <option value="">Tous les statuts</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        <div className="card p-5">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-2xl bg-slate-100" />)}
            </div>
          ) : !data?.items.length ? (
            <div className="grid h-48 place-items-center text-center">
              <div>
                <History size={22} className="mx-auto mb-2 text-slate-300" />
                <p className="text-xs font-bold text-slate-400">Aucune vente ne correspond à ces filtres.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      <th className="pb-2">Ticket</th>
                      <th className="pb-2">Date</th>
                      <th className="pb-2">Caissier</th>
                      <th className="pb-2">Statut</th>
                      <th className="pb-2 text-right">Total</th>
                      <th className="pb-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.items.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 font-black text-blue-700 cursor-pointer" onClick={() => { setInitialEdit(false); setOpenSale(s); }}>
                          #{s.saleNumber}
                        </td>
                        <td className="py-3 text-slate-500">
                          {new Date(s.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3 text-slate-500 font-medium">{s.cashierName || '—'}</td>
                        <td className="py-3">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${STATUS_TONE[s.status]}`}>
                            {STATUS_LABEL[s.status] ?? s.status}
                          </span>
                        </td>
                        <td className="py-3 text-right font-black text-slate-900">{formatMinor(s.totalMinor)}</td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => {
                                localStorage.setItem('pos_edit_sale', JSON.stringify({ id: s.id, saleNumber: s.saleNumber, lines: s.lines }));
                                router.push('/till');
                              }}
                              className="grid h-8 w-8 place-items-center rounded-lg text-slate-600 hover:bg-blue-100 hover:text-blue-700 transition"
                              title="Modifier la commande en Caisse"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              disabled={printingId === s.id}
                              onClick={() => handleReprint(s)}
                              className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-900 transition disabled:opacity-50"
                              title="Réimprimer le reçu"
                            >
                              {printingId === s.id ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                            </button>
                            <button
                              disabled={deletingId === s.id || s.status === 'CANCELLED'}
                              onClick={() => handleDelete(s)}
                              className="grid h-8 w-8 place-items-center rounded-lg text-rose-500 hover:bg-rose-100 hover:text-rose-700 transition disabled:opacity-30"
                              title="Annuler / Supprimer la vente"
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
              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="text-slate-400">{data.total} vente{data.total > 1 ? 's' : ''}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 disabled:opacity-30">
                    <ChevronLeft size={14} />
                  </button>
                  <span className="font-bold text-slate-600">Page {page} / {totalPages}</span>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 disabled:opacity-30">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {openSale && (
        <SaleDrawer
          sale={openSale}
          canEdit={canEdit}
          initialEdit={initialEdit}
          onClose={() => setOpenSale(null)}
          onPrint={(s, format) => setPrintJob({ sale: s, format })}
          onSaved={(s) => {
            setOpenSale(s);
            setData((prev) => (prev ? { ...prev, items: prev.items.map((row) => (row.id === s.id ? s : row)) } : prev));
          }}
        />
      )}

      {printJob && <PrintPreview sale={printJob.sale} format={printJob.format} onClose={() => setPrintJob(null)} />}
    </div>
  );
}
