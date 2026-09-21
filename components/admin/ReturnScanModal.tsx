'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Barcode,
  CheckCircle2,
  Clock,
  Loader2,
  Package,
  PackageCheck,
  Phone,
  RotateCcw,
  Search,
  Truck,
  User,
  X,
  Zap,
} from 'lucide-react';
import { formatDateTime, formatPrice } from '@/lib/site-config';
import { getOrderStatusLabel, getOrderStatusTone } from '@/lib/order-status';
import type { OrderResponse } from '@/types';
import type { OrderSearchResult } from '@/services/order-service';

type RecentReturn = {
  id: string;
  orderNumber: string;
  statusText: string;
  tone: 'success' | 'warn' | 'error';
  timestamp: Date;
};

const RETURN_REASONS = [
  'Client absent',
  'Client refuse le colis',
  'Adresse incorrecte',
  'Téléphone injoignable',
  'Colis non réclamé',
  'Produit incorrect',
  'Autre',
] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  onReturnProcessed?: () => void;
  apiBase?: string;
}

export default function ReturnScanModal({
  open,
  onClose,
  onReturnProcessed,
  apiBase = '/api/admin',
}: Props) {
  const [code, setCode] = useState('');
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeOrder, setActiveOrder] = useState<OrderResponse | null>(null);
  const [matches, setMatches] = useState<OrderResponse[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Return form inputs
  const [reason, setReason] = useState<string>('Client refuse le colis');
  const [note, setNote] = useState<string>('');
  const [continuousMode, setContinuousMode] = useState<boolean>(false);

  // History in this session
  const [recentReturns, setRecentReturns] = useState<RecentReturn[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  // Keep input auto-focused whenever modal opens or state changes
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    } else {
      // Reset state on close
      setCode('');
      setActiveOrder(null);
      setMatches([]);
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [open]);

  function focusInput() {
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
  }

  /* ── Search by code (USB barcode scan or typed) ────────────────────── */
  async function handleSearch(codeToSearch = code) {
    const trimmed = codeToSearch.trim();
    if (!trimmed) return;

    setSearching(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setActiveOrder(null);
    setMatches([]);

    try {
      const res = await fetch(`${apiBase}/orders/search-by-shipment?code=${encodeURIComponent(trimmed)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erreur (${res.status})`);
      }

      const data: OrderSearchResult = await res.json();

      if (data.count === 0) {
        setErrorMsg('Colis introuvable. Vérifiez le code ou le numéro de commande.');
        focusInput();
        return;
      }

      if (data.count > 1) {
        setMatches(data.matches);
        setErrorMsg('Plusieurs commandes correspondent à ce code. Vérification manuelle requise.');
        focusInput();
        return;
      }

      // Exactly 1 order found
      const order = data.order!;
      setActiveOrder(order);

      // Check if order was already returned
      if (order.status === 'retourne' || order.returnInfo) {
        const dateStr = order.returnInfo?.returnedAt
          ? formatDateTime(order.returnInfo.returnedAt)
          : '';
        const byStr = order.returnInfo?.returnedBy?.name || '';
        setErrorMsg(
          `Ce colis a déjà été enregistré comme retourné${dateStr ? ` le ${dateStr}` : ''}${byStr ? ` par ${byStr}` : ''}.`,
        );
        addRecentReturn(order.number, 'Déjà retournée', 'warn');
        focusInput();
        return;
      }

      // Continuous mode: if order is confirmed and unambiguous, validate immediately
      if (continuousMode && (order.status === 'confirme' || order.status === 'completed')) {
        await executeReturn(order);
      } else {
        focusInput();
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Erreur lors de la recherche');
      focusInput();
    } finally {
      setSearching(false);
    }
  }

  /* ── Validate Return ──────────────────────────────────────────────── */
  async function executeReturn(order = activeOrder) {
    if (!order) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const payload = {
        trackingNumber: order.meta?._navex_tracking as string
          || order.meta?._fd_tracking as string
          || order.meta?._axess_tracking as string
          || code.trim()
          || undefined,
        carrier: (order.meta?._mzem_delivery_company as string) || undefined,
        reason: reason || undefined,
        note: note.trim() || undefined,
      };

      const res = await fetch(`${apiBase}/orders/${order.id}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Impossible de valider le retour');
      }

      const totalItems = order.items.reduce((s, i) => s + i.quantity, 0);
      const stockMsg = data.returnInfo?.stockRestored
        ? `Stock restauré au Dépôt : ${totalItems} pièce${totalItems > 1 ? 's' : ''}`
        : 'Statut mis à jour sans sortie de stock préalable';

      setSuccessMsg(`✓ Commande #${order.number} validée comme retournée. ${stockMsg}.`);
      addRecentReturn(order.number, 'Retournée ✓', 'success');

      // Clear input and order preview, prepare for next scan
      setCode('');
      setActiveOrder(null);
      setMatches([]);
      setNote('');

      // Notify parent to refresh orders and counts
      onReturnProcessed?.();
      focusInput();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Erreur lors de la validation du retour');
      addRecentReturn(order.number, 'Échec', 'error');
      focusInput();
    } finally {
      setSubmitting(false);
    }
  }

  function addRecentReturn(orderNumber: string, statusText: string, tone: 'success' | 'warn' | 'error') {
    setRecentReturns((prev) => [
      { id: `${orderNumber}-${Date.now()}`, orderNumber, statusText, tone, timestamp: new Date() },
      ...prev.slice(0, 7),
    ]);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="return-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl rounded-3xl bg-white shadow-2xl border border-ink-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50/70 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-600 text-white shadow-sm">
              <RotateCcw size={20} />
            </div>
            <div>
              <h2 id="return-modal-title" className="text-lg font-black text-ink-900 tracking-tight">
                Retour Colis
              </h2>
              <p className="text-xs font-semibold text-ink-500">
                Scanner ou saisir le code colis pour réintégrer le stock au Dépôt
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition"
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Scanner Input Bar */}
          <div className="space-y-2">
            <label htmlFor="barcode-scanner-input" className="block text-xs font-bold uppercase tracking-wider text-ink-600">
              Code colis / Tracking / N° Commande
            </label>
            <div className="relative">
              <Barcode className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" size={20} />
              <input
                id="barcode-scanner-input"
                ref={inputRef}
                type="text"
                autoComplete="off"
                spellCheck="false"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleSearch();
                  }
                }}
                placeholder="Scanner au lecteur code-barres ou taper Entrée…"
                className="input w-full pl-11 pr-24 text-base font-semibold tracking-wide border-2 border-purple-200 focus:border-purple-600 focus:ring-purple-500/20"
              />
              <button
                type="button"
                disabled={searching || !code.trim()}
                onClick={() => void handleSearch()}
                className="absolute right-2 top-1/2 -translate-y-1/2 btn-primary !min-h-8 !py-1 !px-3 text-xs inline-flex items-center gap-1.5"
              >
                {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                Rechercher
              </button>
            </div>

            {/* Continuous Mode Toggle */}
            <div className="flex items-center justify-between pt-1">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-ink-700 select-none">
                <input
                  type="checkbox"
                  checked={continuousMode}
                  onChange={(e) => setContinuousMode(e.target.checked)}
                  className="h-4 w-4 rounded accent-purple-600 cursor-pointer"
                />
                <span className="flex items-center gap-1">
                  <Zap size={13} className={continuousMode ? 'text-amber-500 fill-amber-500' : 'text-ink-400'} />
                  Mode scan continu (validation automatique des colis confirmés)
                </span>
              </label>
              <span className="text-[11px] text-ink-500">Appuyez sur Entrée après saisie</span>
            </div>
          </div>

          {/* Feedback messages */}
          {errorMsg && (
            <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800 animate-in fade-in">
              <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">{errorMsg}</div>
            </div>
          )}

          {successMsg && (
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 animate-in fade-in">
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1">{successMsg}</div>
            </div>
          )}

          {/* Multiple matches selector */}
          {matches.length > 1 && (
            <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-bold text-amber-900">Plusieurs commandes trouvées ({matches.length}) :</p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {matches.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setActiveOrder(m);
                      setMatches([]);
                      setErrorMsg(null);
                      focusInput();
                    }}
                    className="w-full text-left rounded-xl bg-white p-2.5 text-xs border border-amber-200 hover:border-purple-400 hover:bg-purple-50 transition flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold text-ink-900">#{m.number}</span> — {m.customer.firstName} {m.customer.lastName || ''} ({m.customer.phone})
                    </div>
                    <span className="font-bold text-ink-700">{formatPrice(m.total)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Single Order Preview Card */}
          {activeOrder && (
            <div className="rounded-2xl border border-purple-200 bg-purple-50/40 p-5 space-y-4 animate-in fade-in">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-100 pb-3">
                <div className="flex items-center gap-2">
                  <PackageCheck className="text-purple-600" size={20} />
                  <h3 className="text-base font-black text-ink-900">
                    Commande #{activeOrder.number}
                  </h3>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${getOrderStatusTone(activeOrder.status)}`}>
                    {getOrderStatusLabel(activeOrder.status)}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-ink-900">{formatPrice(activeOrder.total)}</div>
                  <div className="text-[11px] text-ink-500">{formatDateTime(activeOrder.createdAt)}</div>
                </div>
              </div>

              {/* Customer & Carrier details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="space-y-1 bg-white p-3 rounded-xl border border-purple-100">
                  <div className="flex items-center gap-1.5 text-ink-500 font-bold">
                    <User size={13} /> Client
                  </div>
                  <div className="font-bold text-ink-900">
                    {activeOrder.customer.firstName} {activeOrder.customer.lastName || ''}
                  </div>
                  <div className="flex items-center gap-1 text-ink-600 font-mono">
                    <Phone size={12} /> {activeOrder.customer.phone}
                  </div>
                  {activeOrder.customer.city && (
                    <div className="text-ink-600 truncate">{activeOrder.customer.city}</div>
                  )}
                </div>

                <div className="space-y-1 bg-white p-3 rounded-xl border border-purple-100">
                  <div className="flex items-center gap-1.5 text-ink-500 font-bold">
                    <Truck size={13} /> Transporteur &amp; Tracking
                  </div>
                  <div className="font-bold text-ink-900">
                    {(activeOrder.meta?._mzem_delivery_company as string) || 'Non spécifié'}
                  </div>
                  <div className="font-mono text-ink-700 bg-ink-50 px-2 py-0.5 rounded inline-block text-[11px]">
                    {(activeOrder.meta?._navex_tracking as string) ||
                      (activeOrder.meta?._fd_tracking as string) ||
                      (activeOrder.meta?._axess_tracking as string) ||
                      code.trim()}
                  </div>
                </div>
              </div>

              {/* Order Items */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-ink-600 flex items-center gap-1">
                  <Package size={14} /> Articles à réintégrer au Dépôt
                </div>
                <div className="rounded-xl border border-ink-200 bg-white divide-y divide-ink-100 overflow-hidden">
                  {activeOrder.items.map((item, idx) => (
                    <div key={`${item.productId}-${idx}`} className="p-3 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-ink-900">{item.name}</span>
                        {item.attributes && item.attributes.length > 0 && (
                          <div className="text-[11px] text-ink-500">
                            {item.attributes.map((a) => `${a.key}: ${a.value}`).join(' · ')}
                          </div>
                        )}
                      </div>
                      <div className="text-right font-black text-ink-900">
                        × {item.quantity}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status Warning if not confirmed */}
              {activeOrder.status !== 'confirme' && activeOrder.status !== 'completed' && activeOrder.status !== 'retourne' && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
                  <span className="font-bold">Remarque :</span> Cette commande est en statut « {getOrderStatusLabel(activeOrder.status)} » et n&apos;avait pas déduit de stock. La valider comme retournée mettra à jour son statut sans mouvement de stock artificiel.
                </div>
              )}

              {/* Return reason & optional note */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-bold text-ink-700 mb-1">
                    Motif du retour
                  </label>
                  <select
                    className="input w-full text-xs font-semibold"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  >
                    {RETURN_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-700 mb-1">
                    Note facultative
                  </label>
                  <input
                    type="text"
                    placeholder="Remarque particulière…"
                    className="input w-full text-xs"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
              </div>

              {/* Validation CTA */}
              <div className="pt-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={submitting || activeOrder.status === 'retourne'}
                  onClick={() => void executeReturn(activeOrder)}
                  className="btn-primary !bg-purple-600 hover:!bg-purple-700 flex-1 inline-flex items-center justify-center gap-2 min-h-11 text-sm font-bold shadow-soft"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Traitement du retour…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={18} />
                      Valider le retour
                    </>
                  )}
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setActiveOrder(null);
                    setCode('');
                    focusInput();
                  }}
                  className="btn-ghost text-xs"
                >
                  Annuler la sélection
                </button>
              </div>
            </div>
          )}

          {/* Session recent returns list */}
          {recentReturns.length > 0 && (
            <div className="space-y-2 border-t border-ink-100 pt-4">
              <div className="flex items-center gap-1.5 text-xs font-bold text-ink-500">
                <Clock size={13} /> Retours récents de cette session
              </div>
              <div className="space-y-1">
                {recentReturns.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between text-xs py-1.5 px-3 rounded-lg bg-ink-50 border border-ink-100"
                  >
                    <span className="font-bold text-ink-900">Commande #{r.orderNumber}</span>
                    <span
                      className={`font-semibold ${
                        r.tone === 'success'
                          ? 'text-emerald-700'
                          : r.tone === 'warn'
                          ? 'text-amber-700'
                          : 'text-rose-700'
                      }`}
                    >
                      {r.statusText}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
