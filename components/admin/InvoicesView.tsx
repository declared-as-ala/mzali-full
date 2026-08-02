'use client';
import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2, Download, Eye, FileText, Printer, Plus,
  Receipt, RefreshCw, Search, Send, Trash2, X,
} from 'lucide-react';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';

// ─── Types ────────────────────────────────────────────────────────────────────
type InvoiceLine = {
  descriptionSnapshot: string;
  quantity: number;
  unitPriceMinor?: number;
  discountMinor?: number;
  taxMinor?: number;
  lineTotalMinor?: number;
};
type CompanySnapshot = {
  legalName: string; address: string; matriculeFiscal: string;
  rcNumber: string; phone: string; email: string;
};
type Invoice = {
  id: string; invoiceNumber: string; invoiceType: string;
  customerSnapshot: { name: string; phone: string; address?: string | null; email?: string | null };
  companySnapshot?: CompanySnapshot;
  status: string; paymentStatus: string;
  subtotalMinor?: number; discountMinor?: number; taxMinor?: number;
  timbreFiscalMinor?: number; shippingMinor?: number;
  totalMinor?: number; paidMinor?: number; balanceMinor?: number;
  lines: InvoiceLine[];
  issueDate?: string; dueDate?: string | null;
  pdfMediaId: string | null; creditedInvoiceId: string | null;
  notes?: string | null; terms?: string | null;
};
type PickerProduct = { id: string; name: string };

// ─── Lookup tables ────────────────────────────────────────────────────────────
const TYPE_LABEL: Record<string, string> = {
  SALES_INVOICE: 'Facture de vente', POS_INVOICE: 'Facture boutique',
  ONLINE_INVOICE: 'Facture web', PROFORMA: 'Proforma', CREDIT_NOTE: 'Avoir',
};
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Brouillon', FINALIZED: 'Finalisée', SENT: 'Envoyée',
  PARTIALLY_PAID: 'Part. payée', PAID: 'Payée',
  OVERDUE: 'En retard', CANCELLED: 'Annulée', CREDITED: 'Créditée',
};
const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  FINALIZED: 'bg-blue-100 text-blue-700',
  SENT: 'bg-amber-100 text-amber-700',
  PARTIALLY_PAID: 'bg-orange-100 text-orange-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  OVERDUE: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-600',
  CREDITED: 'bg-violet-100 text-violet-700',
};

function formatMinor(minor?: number): string {
  return minor === undefined ? '—' : `${(minor / 1000).toFixed(3)} DT`;
}
function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-TN');
}

// ─── Main view ────────────────────────────────────────────────────────────────
export default function InvoicesView() {
  const toast = useToast();
  const confirmModal = useConfirm();
  const [loading, setLoading]   = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail]     = useState<Invoice | null>(null);
  const [preview, setPreview]   = useState<Invoice | null>(null);
  const [invoicingEnabled, setInvoicingEnabled] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const [res, settingsRes] = await Promise.all([
        fetch('/api/admin/invoices', { cache: 'no-store' }),
        fetch('/api/admin/settings/invoicing', { cache: 'no-store' }),
      ]);
      setInvoices(res.ok ? await res.json() : []);
      setSelectedIds(new Set());
      if (settingsRes.ok) setInvoicingEnabled((await settingsRes.json()).enabled);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);

  function toggleSelectAll() {
    if (selectedIds.size === invoices.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(invoices.map((i) => i.id)));
    }
  }

  function toggleSelectOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDeleteOne(inv: Invoice) {
    const ok = await confirmModal({
      title: `Supprimer la facture ${inv.invoiceNumber} ?`,
      message: 'Cette action est irréversible et supprimera la facture du système.',
      confirmText: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/invoices/${inv.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success(`Facture ${inv.invoiceNumber} supprimée`);
      refresh();
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const ok = await confirmModal({
      title: `Supprimer ${ids.length} facture(s) ?`,
      message: 'Toutes les factures sélectionnées seront définitivement supprimées.',
      confirmText: 'Supprimer définitivement',
      tone: 'danger',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/admin/invoices/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${ids.length} facture(s) supprimée(s)`);
      refresh();
    } catch {
      toast.error('Erreur lors de la suppression groupée');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black">Factures</h1>
          <p className="text-ink-700">Factures, proformas, avoirs — la facturation réelle nécessite l'activation dans les paramètres.</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={deleting}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-rose-700 active:scale-[.98] disabled:opacity-50 transition"
            >
              <Trash2 size={15} /> Supprimer ({selectedIds.size})
            </button>
          )}
          <button onClick={refresh} className="btn-ghost inline-flex items-center gap-2">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualiser
          </button>
          <button onClick={() => setCreating(true)} className="btn-primary inline-flex items-center gap-2">
            <Plus size={16} /> Nouvelle facture
          </button>
        </div>
      </header>

      {!invoicingEnabled && (
        <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          La facturation n'est pas activée — les factures peuvent être créées en brouillon mais pas finalisées avant confirmation du comptable (Paramètres → Facturation).
        </div>
      )}

      <div className="overflow-hidden rounded-2xl bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-100 text-xs font-black uppercase text-ink-700">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={invoices.length > 0 && selectedIds.size === invoices.length}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </th>
              <th className="px-4 py-3">N°</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Solde</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const checked = selectedIds.has(inv.id);
              return (
                <tr key={inv.id} className={`border-t border-ink-200 hover:bg-ink-50 transition-colors ${checked ? 'bg-blue-50/50' : ''}`}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelectOne(inv.id)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3 font-bold text-brand-700">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3 text-ink-700">{TYPE_LABEL[inv.invoiceType] ?? inv.invoiceType}</td>
                  <td className="px-4 py-3 font-bold text-ink-900">{inv.customerSnapshot.name}</td>
                  <td className="px-4 py-3 text-ink-700">{fmtDate(inv.issueDate)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-black ${STATUS_COLOR[inv.status] ?? 'bg-ink-200 text-ink-700'}`}>
                      {STATUS_LABEL[inv.status] ?? inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-bold">{formatMinor(inv.totalMinor)}</td>
                  <td className="px-4 py-3 font-bold text-brand-700">{formatMinor(inv.balanceMinor)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setPreview(inv)}
                        className="btn-ghost px-2.5 py-1.5 text-xs inline-flex items-center gap-1"
                        title="Aperçu / Imprimer"
                      >
                        <Eye size={13} /> Aperçu
                      </button>
                      <button
                        onClick={() => setDetail(inv)}
                        className="btn-ghost px-2.5 py-1.5 text-xs"
                      >
                        Ouvrir
                      </button>
                      <button
                        onClick={() => handleDeleteOne(inv)}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition"
                        title="Supprimer la facture"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!invoices.length && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-ink-700">Aucune facture.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <CreateInvoiceDrawer
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); refresh(); }}
        />
      )}
      {detail && (
        <InvoiceDetailDrawer
          invoice={detail}
          onClose={() => setDetail(null)}
          onChanged={(inv) => { setDetail(inv); refresh(); }}
          onPreview={() => { setPreview(detail); }}
        />
      )}
      {preview && (
        <InvoicePreviewModal
          invoice={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

// ─── Print Preview Modal ──────────────────────────────────────────────────────
function InvoicePreviewModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);

  function handlePrint() {
    const content = printRef.current?.innerHTML ?? '';
    const win = window.open('', '_blank', 'width=900,height=1200');
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${invoice.invoiceNumber}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; background: #fff; color: #111827; }
    .invoice-wrap { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 12mm 14mm; background: #fff; }
    @media print {
      @page { size: A4 portrait; margin: 0; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .invoice-wrap { padding: 12mm 14mm; }
    }
  </style>
</head>
<body>
  <div class="invoice-wrap">${content}</div>
  <script>window.onload=()=>{window.print();}<\/script>
</body>
</html>`);
    win.document.close();
  }

  // compute TVA percent for display
  const taxPct = (() => {
    const sub = invoice.subtotalMinor ?? 0;
    const disc = invoice.discountMinor ?? 0;
    const tax = invoice.taxMinor ?? 0;
    if (!tax || !(sub - disc)) return 19;
    return Math.round((tax / (sub - disc)) * 100);
  })();

  const accent  = '#1a2ee8';
  const accentBg = '#eef0fd';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 backdrop-blur-sm py-8">
      {/* Toolbar */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 shadow-2xl border border-slate-200">
        <span className="text-sm font-bold text-slate-700 mr-2">{invoice.invoiceNumber}</span>
        <button
          onClick={handlePrint}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 transition-colors"
        >
          <Printer size={15} /> Imprimer / PDF
        </button>
        {invoice.pdfMediaId && (
          <a
            href={`/api/admin/media/${invoice.pdfMediaId}/download`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Download size={15} /> PDF généré
          </a>
        )}
        <button onClick={onClose} className="ml-2 grid h-9 w-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* A4 Invoice Card */}
      <div
        ref={printRef}
        style={{
          fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
          width: '210mm',
          minHeight: '297mm',
          background: '#fff',
          color: '#111827',
          borderRadius: '12px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.18)',
          padding: '12mm 14mm',
          marginTop: '64px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Top blue strip */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '5px', background: accent }} />

        {/* Decorative corner */}
        <div style={{
          position: 'absolute', top: 0, right: 0,
          width: '90px', height: '90px',
          background: accent,
          clipPath: 'polygon(100% 0, 0 0, 100% 100%)',
          opacity: 0.15,
        }} />
        <div style={{
          position: 'absolute', top: 0, right: 0,
          width: '60px', height: '60px',
          background: accent,
          clipPath: 'polygon(100% 0, 0 0, 100% 100%)',
        }} />

        {/* HEADER */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '10px', marginBottom: '24px' }}>
          {/* Left — Company */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            {/* Logo placeholder */}
            <div style={{
              width: '48px', height: '48px', borderRadius: '12px',
              background: accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="8" height="8" rx="1.5" fill={accent} />
                <rect x="13" y="3" width="8" height="8" rx="1.5" fill={accent} opacity="0.6" />
                <rect x="3" y="13" width="8" height="8" rx="1.5" fill={accent} opacity="0.6" />
                <rect x="13" y="13" width="8" height="8" rx="1.5" fill={accent} opacity="0.3" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '800', color: '#111827', lineHeight: 1.2 }}>
                {invoice.companySnapshot?.legalName || 'Mzali'}
              </div>
              {/* Company details with icons */}
              <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {invoice.companySnapshot?.address && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#6b7280' }}>
                    <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: accentBg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', flexShrink: 0 }}>📍</span>
                    {invoice.companySnapshot.address}
                  </div>
                )}
                {invoice.companySnapshot?.matriculeFiscal && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#6b7280' }}>
                    <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: accentBg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', flexShrink: 0 }}>🏛</span>
                    MF: {invoice.companySnapshot.matriculeFiscal}
                  </div>
                )}
                {invoice.companySnapshot?.email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#6b7280' }}>
                    <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: accentBg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', flexShrink: 0 }}>✉</span>
                    {invoice.companySnapshot.email}
                  </div>
                )}
                {invoice.companySnapshot?.phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#6b7280' }}>
                    <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: accentBg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', flexShrink: 0 }}>📞</span>
                    {invoice.companySnapshot.phone}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right — Title + Meta */}
          <div style={{ textAlign: 'right', minWidth: '200px' }}>
            <div style={{ fontSize: '38px', fontWeight: '900', color: accent, letterSpacing: '-1px', lineHeight: 1 }}>
              {invoice.invoiceType === 'CREDIT_NOTE' ? 'AVOIR'
                : invoice.invoiceType === 'PROFORMA' ? 'PROFORMA'
                : 'FACTURE'}
            </div>
            <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {/* Invoice number */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end',
                background: '#f9fafb', borderRadius: '8px', padding: '6px 10px',
              }}>
                <div style={{ borderLeft: `3px solid ${accent}`, paddingLeft: '8px', textAlign: 'left' }}>
                  <div style={{ fontSize: '8px', color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>N°</div>
                  <div style={{ fontSize: '11px', fontWeight: '800', color: '#111827' }}>{invoice.invoiceNumber}</div>
                </div>
              </div>
              {/* Date */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end',
                background: '#f9fafb', borderRadius: '8px', padding: '6px 10px',
              }}>
                <div style={{ borderLeft: `3px solid ${accent}`, paddingLeft: '8px', textAlign: 'left' }}>
                  <div style={{ fontSize: '8px', color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date</div>
                  <div style={{ fontSize: '11px', fontWeight: '800', color: '#111827' }}>{fmtDate(invoice.issueDate)}</div>
                </div>
              </div>
              {/* Status badge */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <span style={{
                  background: accentBg, color: accent, fontSize: '9px', fontWeight: '700',
                  padding: '3px 10px', borderRadius: '99px', textTransform: 'uppercase', letterSpacing: '0.5px',
                }}>
                  {STATUS_LABEL[invoice.status] ?? invoice.status}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* CUSTOMER BLOCK */}
        <div style={{
          background: '#f9fafb', borderRadius: '12px', padding: '16px 20px',
          display: 'flex', alignItems: 'center', gap: '18px',
          marginBottom: '24px',
          border: '1px solid #f0f0f0',
        }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '50%',
            background: accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill={accent}>
              <circle cx="12" cy="8" r="4" />
              <path d="M20 20c0-4.418-3.582-8-8-8s-8 3.582-8 8h16z" />
            </svg>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ fontSize: '9px', fontWeight: '800', color: accent, textTransform: 'uppercase', letterSpacing: '1px' }}>FACTURÉ À</span>
              <div style={{ flex: 1, height: '2px', background: accent, borderRadius: '1px', maxWidth: '40px' }} />
            </div>
            <div style={{ fontSize: '14px', fontWeight: '800', color: '#111827' }}>{invoice.customerSnapshot.name}</div>
            <div style={{ display: 'flex', gap: '16px', marginTop: '4px', flexWrap: 'wrap' }}>
              {invoice.customerSnapshot.phone && (
                <span style={{ fontSize: '10px', color: '#6b7280' }}>{invoice.customerSnapshot.phone}</span>
              )}
              {invoice.customerSnapshot.address && (
                <span style={{ fontSize: '10px', color: '#6b7280' }}>{invoice.customerSnapshot.address}</span>
              )}
              {invoice.customerSnapshot.email && (
                <span style={{ fontSize: '10px', color: '#6b7280' }}>{invoice.customerSnapshot.email}</span>
              )}
            </div>
          </div>
        </div>

        {/* ITEMS TABLE */}
        <div style={{ marginBottom: '24px', borderRadius: '10px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
          {/* Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 60px 90px 80px 90px',
            background: accent, color: '#fff',
            padding: '10px 14px',
            fontSize: '9px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.8px',
          }}>
            <span>DESCRIPTION</span>
            <span style={{ textAlign: 'right' }}>QTÉ</span>
            <span style={{ textAlign: 'right' }}>P.U.</span>
            <span style={{ textAlign: 'right' }}>REMISE</span>
            <span style={{ textAlign: 'right' }}>TOTAL</span>
          </div>
          {/* Rows */}
          {invoice.lines.map((line, i) => (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: '1fr 60px 90px 80px 90px',
              padding: '10px 14px',
              background: i % 2 === 1 ? '#f9fafb' : '#fff',
              borderTop: '1px solid #f0f0f0',
              fontSize: '11px', color: '#374151', alignItems: 'center',
            }}>
              <span style={{ fontWeight: '500', wordBreak: 'break-word' }}>{line.descriptionSnapshot}</span>
              <span style={{ textAlign: 'right', color: '#6b7280' }}>{line.quantity}</span>
              <span style={{ textAlign: 'right', color: '#6b7280' }}>{formatMinor(line.unitPriceMinor)}</span>
              <span style={{ textAlign: 'right', color: (line.discountMinor ?? 0) > 0 ? '#e11d48' : '#9ca3af' }}>
                {(line.discountMinor ?? 0) > 0 ? `-${formatMinor(line.discountMinor)}` : '—'}
              </span>
              <span style={{ textAlign: 'right', fontWeight: '700', color: '#111827' }}>{formatMinor(line.lineTotalMinor)}</span>
            </div>
          ))}
          {!invoice.lines.length && (
            <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '11px' }}>Aucune ligne.</div>
          )}
        </div>

        {/* LOWER SECTION: Merci + Totals */}
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', marginBottom: '32px' }}>
          {/* Left — decorative */}
          <div style={{ flex: 1 }}>
            {/* Faint document illustration */}
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ position: 'relative', width: '80px', height: '100px', flexShrink: 0 }}>
                <div style={{
                  width: '70px', height: '90px', borderRadius: '8px',
                  border: '1.5px solid #e5e7eb', background: '#f9fafb',
                  display: 'flex', flexDirection: 'column', gap: '6px',
                  padding: '12px 10px',
                }}>
                  <div style={{ height: '6px', background: '#e5e7eb', borderRadius: '3px' }} />
                  <div style={{ height: '6px', background: '#e5e7eb', borderRadius: '3px', width: '80%' }} />
                  <div style={{ height: '6px', background: '#e5e7eb', borderRadius: '3px' }} />
                  <div style={{ height: '6px', background: '#e5e7eb', borderRadius: '3px', width: '60%' }} />
                </div>
                <div style={{
                  position: 'absolute', bottom: '-4px', right: '-4px',
                  width: '28px', height: '28px', borderRadius: '50%',
                  background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '800', color: accent, marginBottom: '4px' }}>
                  Merci pour votre confiance.
                </div>
                <div style={{ fontSize: '9px', color: '#9ca3af', lineHeight: 1.5 }}>
                  Nous vous remercions pour votre business<br />et restons à votre disposition.
                </div>
              </div>
            </div>

            {/* Notes / Terms */}
            {invoice.notes && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ fontSize: '8px', fontWeight: '800', color: accent, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Notes</div>
                <div style={{ fontSize: '9px', color: '#6b7280', lineHeight: 1.5 }}>{invoice.notes}</div>
              </div>
            )}
            {invoice.terms && (
              <div style={{ marginTop: '10px' }}>
                <div style={{ fontSize: '8px', fontWeight: '800', color: accent, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Conditions</div>
                <div style={{ fontSize: '9px', color: '#6b7280', lineHeight: 1.5 }}>{invoice.terms}</div>
              </div>
            )}
          </div>

          {/* Right — Totals card */}
          <div style={{
            width: '230px', flexShrink: 0,
            border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden',
          }}>
            {/* Totals rows */}
            {[
              { label: 'Sous-total', value: formatMinor(invoice.subtotalMinor), show: true },
              { label: 'Remise', value: `-${formatMinor(invoice.discountMinor)}`, show: (invoice.discountMinor ?? 0) > 0, red: true },
              { label: `TVA (${taxPct}%)`, value: formatMinor(invoice.taxMinor), show: (invoice.taxMinor ?? 0) > 0 },
              { label: 'Livraison', value: formatMinor(invoice.shippingMinor), show: (invoice.shippingMinor ?? 0) > 0 },
              { label: 'Timbre fiscal', value: formatMinor(invoice.timbreFiscalMinor), show: (invoice.timbreFiscalMinor ?? 0) > 0 },
            ].filter(r => r.show).map((row, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px',
                borderBottom: '1px solid #f0f0f0',
                background: '#fff',
              }}>
                <span style={{ fontSize: '10.5px', color: '#6b7280' }}>{row.label}</span>
                <span style={{ fontSize: '10.5px', fontWeight: '700', color: (row as any).red ? '#e11d48' : '#111827' }}>{row.value}</span>
              </div>
            ))}
            {/* Grand total */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px', background: accent,
            }}>
              <span style={{ fontSize: '13px', fontWeight: '900', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>TOTAL</span>
              <span style={{ fontSize: '16px', fontWeight: '900', color: '#fff' }}>{formatMinor(invoice.totalMinor)}</span>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            {[
              {
                label: 'CONTACT',
                line1: invoice.companySnapshot?.email ?? '',
                line2: invoice.companySnapshot?.phone ?? '',
                icon: '✉',
              },
              {
                label: 'ADRESSE',
                line1: invoice.companySnapshot?.address ?? '',
                line2: '',
                icon: '📍',
              },
              {
                label: 'MERCI',
                line1: 'Nous vous remercions pour',
                line2: 'votre confiance.',
                icon: '🌐',
              },
            ].map((col) => (
              <div key={col.label} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <div style={{
                  width: '30px', height: '30px', borderRadius: '50%',
                  background: accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '13px', flexShrink: 0,
                }}>
                  {col.icon}
                </div>
                <div>
                  <div style={{ fontSize: '9px', fontWeight: '800', color: accent, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '4px' }}>
                    {col.label}
                  </div>
                  {col.line1 && <div style={{ fontSize: '9px', color: '#6b7280' }}>{col.line1}</div>}
                  {col.line2 && <div style={{ fontSize: '9px', color: '#6b7280' }}>{col.line2}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom strip */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '5px', background: accent }} />
      </div>
    </div>
  );
}

// ─── Create Invoice Drawer ────────────────────────────────────────────────────
function CreateInvoiceDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [invoiceType, setInvoiceType] = useState('SALES_INVOICE');
  const [name, setName]               = useState('');
  const [phone, setPhone]             = useState('');
  const [products, setProducts]       = useState<PickerProduct[]>([]);
  const [search, setSearch]           = useState('');
  const [lines, setLines]             = useState<{ productId: string; name: string; quantity: number }[]>([]);
  const [busy, setBusy]               = useState(false);

  useEffect(() => {
    fetch('/api/admin/products-picker')
      .then((r) => r.json())
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);
  const filtered = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8);

  async function submit() {
    if (!name.trim() || !phone.trim() || !lines.length) { toast.error('Client et produits requis'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceType,
          customerSnapshot: { name: name.trim(), phone: phone.trim() },
          lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error ?? 'Erreur'); return; }
      toast.success('Facture créée (brouillon)');
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-black text-ink-900">Nouvelle facture</h2>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100">
            <X size={18} />
          </button>
        </div>
        <label className="mb-4 block text-sm font-bold">Type
          <select className="input mt-1" value={invoiceType} onChange={(e) => setInvoiceType(e.target.value)}>
            <option value="SALES_INVOICE">Facture de vente</option>
            <option value="POS_INVOICE">Facture boutique</option>
            <option value="ONLINE_INVOICE">Facture web</option>
            <option value="PROFORMA">Proforma</option>
          </select>
        </label>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <label className="block text-sm font-bold">Client<input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="block text-sm font-bold">Téléphone<input className="input mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        </div>
        <div className="mb-4 space-y-2">
          <label className="block text-sm font-bold text-slate-800">Ajouter un produit</label>

          {/* Quick select dropdown */}
          <select
            className="input w-full cursor-pointer font-bold text-sm bg-slate-50 border-slate-200"
            onChange={(e) => {
              const pId = e.target.value;
              if (!pId) return;
              const p = products.find((x) => x.id === pId);
              if (p && !lines.some((l) => l.productId === p.id)) {
                setLines((prev) => [...prev, { productId: p.id, name: p.name, quantity: 1 }]);
              }
              e.target.value = '';
            }}
            value=""
          >
            <option value="" disabled>-- Sélectionner un produit dans la liste ({products.length}) --</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Search filter input */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              className="input pl-9 py-2 text-xs"
              placeholder="Filtrer la liste par nom..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Always visible product list */}
          <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 bg-slate-50/50">
            {filtered.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-500">Aucun produit disponible</div>
            ) : (
              filtered.map((p) => {
                const isAdded = lines.some((l) => l.productId === p.id);
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => {
                      if (!isAdded) {
                        setLines((prev) => [...prev, { productId: p.id, name: p.name, quantity: 1 }]);
                      }
                    }}
                    className={`flex w-full items-center justify-between px-3.5 py-2 text-left text-xs transition ${
                      isAdded ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-blue-50/60 text-slate-800'
                    }`}
                  >
                    <span className="font-semibold">{p.name}</span>
                    <span className="text-[11px] font-bold">{isAdded ? '✓ Ajouté' : '+ Ajouter'}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
        <div className="mb-5 space-y-2">
          {lines.map((l) => (
            <div key={l.productId} className="flex items-center gap-2 rounded-xl bg-ink-100 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-bold">{l.name}</span>
              <input
                type="number" min={1} className="input w-16 py-1 text-center" value={l.quantity}
                onChange={(e) => setLines((prev) => prev.map((x) => (x.productId === l.productId ? { ...x, quantity: Math.max(1, Number(e.target.value)) } : x)))}
              />
              <button onClick={() => setLines((prev) => prev.filter((x) => x.productId !== l.productId))} className="text-ink-500 hover:text-red-600">
                <X size={16} />
              </button>
            </div>
          ))}
          {!lines.length && <p className="text-sm text-ink-500">Aucun produit ajouté.</p>}
        </div>
        <button disabled={busy} onClick={submit} className="btn-primary w-full disabled:opacity-40">
          {busy ? 'Enregistrement…' : 'Créer le brouillon'}
        </button>
      </div>
    </div>
  );
}

// ─── Invoice Detail Drawer ────────────────────────────────────────────────────
function InvoiceDetailDrawer({
  invoice, onClose, onChanged, onPreview,
}: {
  invoice: Invoice;
  onClose: () => void;
  onChanged: (inv: Invoice) => void;
  onPreview: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy]                   = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');

  async function action(path: string, body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/invoices/${invoice.id}${path}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error ?? 'Erreur'); return; }
      toast.success('Facture mise à jour');
      onChanged(data.original ?? data);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-ink-900">{invoice.invoiceNumber}</h2>
            <p className="text-sm text-ink-700">{invoice.customerSnapshot.name} · {STATUS_LABEL[invoice.status] ?? invoice.status}</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onPreview} className="btn-ghost px-3 py-1.5 text-xs inline-flex items-center gap-1">
              <Eye size={13} /> Aperçu
            </button>
            <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between rounded-xl bg-ink-100 p-3 text-sm">
          <span className="font-bold">Total {formatMinor(invoice.totalMinor)} · Payé {formatMinor(invoice.paidMinor)}</span>
          <span className="font-black text-brand-700">Solde {formatMinor(invoice.balanceMinor)}</span>
        </div>

        <div className="mb-5 space-y-2">
          {invoice.lines.map((l, i) => (
            <div key={i} className="rounded-xl bg-ink-100 p-3 text-sm">
              <p className="font-bold text-ink-900">{l.descriptionSnapshot}</p>
              <p className="text-xs text-ink-700">{l.quantity} × {formatMinor(l.unitPriceMinor)} = {formatMinor(l.lineTotalMinor)}</p>
            </div>
          ))}
        </div>

        {invoice.pdfMediaId && (
          <a
            href={`/api/admin/media/${invoice.pdfMediaId}/download`}
            target="_blank" rel="noreferrer"
            className="btn-ghost mb-4 inline-flex items-center gap-2"
          >
            <Download size={14} /> Télécharger le PDF
          </a>
        )}

        <div className="mb-5 flex flex-wrap gap-2">
          {invoice.status === 'DRAFT' && (
            <button disabled={busy} onClick={() => action('/finalize')} className="btn-primary inline-flex items-center gap-2 disabled:opacity-40">
              <CheckCircle2 size={14} /> Finaliser
            </button>
          )}
          {invoice.status === 'FINALIZED' && (
            <button disabled={busy} onClick={() => action('/send')} className="btn-primary inline-flex items-center gap-2 disabled:opacity-40">
              <Send size={14} /> Envoyer
            </button>
          )}
          {['FINALIZED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice.status) && invoice.invoiceType !== 'CREDIT_NOTE' && (
            <button disabled={busy} onClick={() => action('/credit-note')} className="btn-ghost inline-flex items-center gap-2">
              <Receipt size={14} /> Émettre un avoir
            </button>
          )}
        </div>

        {['FINALIZED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice.status) && (invoice.balanceMinor ?? 0) > 0 && (
          <div className="rounded-xl bg-ink-100 p-3">
            <h3 className="mb-2 text-xs font-black uppercase text-ink-700">Enregistrer un paiement</h3>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" min={0} step={0.001} placeholder="Montant (DT)" className="input py-1.5" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
              <select className="input py-1.5" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="cash">Espèces</option>
                <option value="card">Carte</option>
                <option value="transfer">Virement</option>
                <option value="check">Chèque</option>
              </select>
            </div>
            <button
              disabled={busy || !paymentAmount}
              onClick={() => { action('/payments', { amount: Number(paymentAmount), method: paymentMethod }); setPaymentAmount(''); }}
              className="btn-primary mt-2 w-full disabled:opacity-40"
            >
              Enregistrer le paiement
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
