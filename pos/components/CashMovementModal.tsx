'use client';

import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, History, Plus, Receipt, ShieldAlert, Wallet, X, Check } from 'lucide-react';
import { posFetch } from '@/lib/device';
import { formatMinor } from '@/lib/money';
import type { PosCashMovement } from '@/types/pos';

interface CashMovementModalProps {
  sessionId: string;
  onClose: () => void;
  onMovementAdded?: () => void;
}

const OUTFLOW_CATEGORIES = [
  { id: 'FOURNISSEUR', label: 'Fournisseur' },
  { id: 'SALAIRE_AVANCE', label: 'Salaire / Avance employé' },
  { id: 'TRANSPORT', label: 'Transport' },
  { id: 'ACHAT_MATERIEL', label: 'Achat matériel' },
  { id: 'FRAIS_DIVERS', label: 'Frais divers' },
  { id: 'AUTRE', label: 'Autre dépense' },
];

const INFLOW_CATEGORIES = [
  { id: 'FLOAT_ADD', label: 'Apport de fond supplémentaire' },
  { id: 'REIMBURSEMENT', label: 'Remboursement espèces' },
  { id: 'ADJUSTMENT', label: 'Ajustement caisse autorisé' },
  { id: 'AUTRE', label: 'Autre entrée' },
];

export default function CashMovementModal({ sessionId, onClose, onMovementAdded }: CashMovementModalProps) {
  const [activeTab, setActiveTab] = useState<'OUT' | 'IN' | 'HISTORY'>('OUT');
  const [amount, setAmount] = useState<string>('');
  const [category, setCategory] = useState<string>('FOURNISSEUR');
  const [beneficiary, setBeneficiary] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH');
  const [reference, setReference] = useState<string>('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [movements, setMovements] = useState<PosCashMovement[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (activeTab === 'HISTORY') {
      loadHistory();
    }
  }, [activeTab]);

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const res = await posFetch(`/api/sessions/${sessionId}/cash-movements`);
      if (res.ok) {
        setMovements(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountVal = Math.round(Number(amount) * 1000);
    if (!amountVal || amountVal <= 0) {
      setError('Veuillez saisir un montant valide supérieur à 0.');
      return;
    }
    if (!reason.trim()) {
      setError('Le motif est obligatoire pour la traçabilité comptable.');
      return;
    }

    setBusy(true);
    setError(null);
    setSuccessMsg(null);

    const isOutflow = activeTab === 'OUT';
    const type = isOutflow ? 'CASH_OUT' : 'CASH_IN';
    const categoryList = isOutflow ? OUTFLOW_CATEGORIES : INFLOW_CATEGORIES;
    const catObj = categoryList.find((c) => c.id === category);

    try {
      const res = await posFetch(`/api/sessions/${sessionId}/cash-movements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          amountMinor: amountVal,
          reason: reason.trim(),
          category,
          categoryLabel: catObj?.label || category,
          beneficiary: beneficiary.trim() || undefined,
          paymentMethod,
          reference: reference.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Échec de l'enregistrement du mouvement");
      }

      setSuccessMsg(
        isOutflow
          ? `Sortie de ${(amountVal / 1000).toFixed(3)} DT enregistrée avec succès.`
          : `Entrée de ${(amountVal / 1000).toFixed(3)} DT enregistrée avec succès.`,
      );
      setAmount('');
      setBeneficiary('');
      setReason('');
      setReference('');

      window.dispatchEvent(new Event('pos-cash-changed'));
      onMovementAdded?.();

      setTimeout(() => {
        setSuccessMsg(null);
      }, 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cash-movements-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-100 text-blue-600">
              <Wallet size={20} />
            </div>
            <div>
              <h2 id="cash-movements-title" className="text-lg font-black text-slate-900">
                Mouvements de Caisse
              </h2>
              <p className="text-xs text-slate-500">Dépenses, paiements fournisseurs et entrées d&apos;espèces</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition cursor-pointer"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-200 px-6 pt-3 gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('OUT');
              setCategory('FOURNISSEUR');
              setError(null);
            }}
            className={`flex items-center gap-2 border-b-2 pb-3 px-3 text-xs sm:text-sm font-bold transition cursor-pointer ${
              activeTab === 'OUT'
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ArrowDownRight size={16} />
            <span>Sortie d&apos;argent (Dépense)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('IN');
              setCategory('FLOAT_ADD');
              setError(null);
            }}
            className={`flex items-center gap-2 border-b-2 pb-3 px-3 text-xs sm:text-sm font-bold transition cursor-pointer ${
              activeTab === 'IN'
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ArrowUpRight size={16} />
            <span>Entrée d&apos;argent</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('HISTORY');
              setError(null);
            }}
            className={`flex items-center gap-2 border-b-2 pb-3 px-3 text-xs sm:text-sm font-bold transition cursor-pointer ${
              activeTab === 'HISTORY'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <History size={16} />
            <span>Historique</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="max-h-[70vh] overflow-y-auto p-6">
          {successMsg && (
            <div className="mb-4 flex items-center gap-2 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-bold text-emerald-800">
              <Check size={18} className="shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-bold text-red-800">
              <ShieldAlert size={18} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {activeTab === 'HISTORY' ? (
            <div>
              {loadingHistory ? (
                <div className="py-12 text-center text-sm text-slate-400">Chargement de l&apos;historique…</div>
              ) : movements.length === 0 ? (
                <div className="py-12 text-center">
                  <Receipt size={36} className="mx-auto mb-2 text-slate-300" />
                  <p className="font-bold text-slate-700">Aucun mouvement enregistré</p>
                  <p className="text-xs text-slate-400 mt-1">Les sorties et entrées de cette session apparaîtront ici.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {movements.map((m) => {
                    const isOut = m.type === 'CASH_OUT' || m.type === 'REMOVE';
                    const isIn = m.type === 'CASH_IN' || m.type === 'ADD' || m.type === 'OPENING_FUND';
                    return (
                      <div key={m.id || String(m.createdAt)} className="flex items-center justify-between py-3">
                        <div className="min-w-0 pr-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                                isOut
                                  ? 'bg-red-100 text-red-700'
                                  : isIn
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {m.categoryLabel || m.category || m.type}
                            </span>
                            {m.beneficiary && (
                              <span className="text-xs font-semibold text-slate-700 truncate">
                                Pour : {m.beneficiary}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-slate-600 line-clamp-1">{m.reason}</p>
                          <p className="mt-0.5 text-[10px] text-slate-400">
                            {new Date(m.createdAt).toLocaleTimeString('fr-TN', { hour: '2-digit', minute: '2-digit' })}{' '}
                            {m.performedByName ? `· Par ${m.performedByName}` : ''}
                          </p>
                        </div>
                        <span
                          className={`text-sm font-black tabular-nums shrink-0 ${
                            isOut ? 'text-red-600' : 'text-emerald-600'
                          }`}
                        >
                          {isOut ? '-' : '+'}
                          {formatMinor(m.amountMinor)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Amount Input */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Montant en Dinars (DT) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    required
                    placeholder="0.000"
                    autoFocus
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-2xl font-black text-slate-900 placeholder:text-slate-300 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 transition text-center"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                    DT
                  </span>
                </div>
                {Number(amount) > 0 && (
                  <p className="mt-1.5 text-center text-xs font-semibold text-slate-500">
                    Soit {formatMinor(Math.round(Number(amount) * 1000))}
                  </p>
                )}
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Catégorie *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 transition"
                >
                  {(activeTab === 'OUT' ? OUTFLOW_CATEGORIES : INFLOW_CATEGORIES).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Beneficiary */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  {activeTab === 'OUT' ? 'Bénéficiaire (Fournisseur, Employé, etc.)' : 'Source / Bénéficiaire'}
                </label>
                <input
                  type="text"
                  placeholder={activeTab === 'OUT' ? 'Ex : Fournisseur Ahmed, Employé Mohamed...' : 'Ex : Dépôt gérant, Client...'}
                  value={beneficiary}
                  onChange={(e) => setBeneficiary(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 transition"
                />
              </div>

              {/* Reason */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Motif / Justification obligatoire *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex : Paiement facture livraison, Avance sur salaire, Nettoyage..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 transition"
                />
              </div>

              {/* Payment Method & Reference Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Mode de sortie
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-semibold text-slate-800 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 transition"
                  >
                    <option value="CASH">Espèces (Tiroir-caisse)</option>
                    <option value="CARD">Carte bancaire</option>
                    <option value="BANK_TRANSFER">Virement bancaire</option>
                    <option value="OTHER">Autre</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    N° Reçu / Facture (Optionnel)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex : FACT-0482"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 transition"
                  />
                </div>
              </div>

              {/* Informative notice */}
              <div
                className={`rounded-2xl p-3.5 text-xs font-semibold ${
                  paymentMethod === 'CASH'
                    ? activeTab === 'OUT'
                      ? 'bg-red-50 text-red-700 border border-red-100'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                    : 'bg-slate-50 text-slate-600 border border-slate-200'
                }`}
              >
                {paymentMethod === 'CASH' ? (
                  activeTab === 'OUT' ? (
                    <span>⚠️ Ce montant sera <strong>immédiatement déduit</strong> du solde théorique du tiroir-caisse.</span>
                  ) : (
                    <span>✓ Ce montant sera <strong>immédiatement ajouté</strong> au solde théorique du tiroir-caisse.</span>
                  )
                ) : (
                  <span>ℹ Ce mouvement ne modifie pas le tiroir-caisse physique (paiement non-espèces).</span>
                )}
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={busy || !amount || Number(amount) <= 0 || !reason.trim()}
                className={`w-full rounded-2xl py-3.5 text-base font-black text-white shadow-md transition active:scale-[0.98] disabled:opacity-40 cursor-pointer ${
                  activeTab === 'OUT'
                    ? 'bg-red-600 hover:bg-red-700 shadow-red-600/25'
                    : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25'
                }`}
              >
                {busy ? 'Enregistrement…' : activeTab === 'OUT' ? 'ENREGISTRER LA SORTIE D\'ARGENT' : 'ENREGISTRER L\'ENTRÉE D\'ARGENT'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

