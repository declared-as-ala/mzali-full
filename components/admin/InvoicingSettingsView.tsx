'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle, Building2, CheckCircle2, FileText,
  Mail, Phone, Save, ShieldCheck, Sparkles, Receipt,
  HelpCircle, Landmark, MapPin, Hash, Percent, Stamp
} from 'lucide-react';
import { useToast } from './Toast';

type CompanySettings = {
  legalName: string;
  address: string;
  matriculeFiscal: string;
  rcNumber: string;
  phone: string;
  email: string;
};

type InvoicingSettings = {
  enabled: boolean;
  tvaRatePercent: number;
  timbreFiscalMinor: number;
};

export default function InvoicingSettingsView() {
  const toast = useToast();
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [invoicing, setInvoicing] = useState<InvoicingSettings | null>(null);
  const [busyCompany, setBusyCompany] = useState(false);
  const [busyInvoicing, setBusyInvoicing] = useState(false);

  useEffect(() => {
    fetch('/api/admin/settings/company')
      .then((r) => r.json())
      .then(setCompany)
      .catch(() => {});
    fetch('/api/admin/settings/invoicing')
      .then((r) => r.json())
      .then(setInvoicing)
      .catch(() => {});
  }, []);

  async function saveCompany() {
    if (!company) return;
    setBusyCompany(true);
    try {
      const res = await fetch('/api/admin/settings/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(company),
      });
      if (!res.ok) {
        toast.error('Erreur lors de la sauvegarde des informations société');
        return;
      }
      toast.success('Informations de la société enregistrées avec succès');
    } finally {
      setBusyCompany(false);
    }
  }

  async function saveInvoicing() {
    if (!invoicing) return;
    setBusyInvoicing(true);
    try {
      const res = await fetch('/api/admin/settings/invoicing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoicing),
      });
      if (!res.ok) {
        toast.error('Erreur lors de la sauvegarde des paramètres de facturation');
        return;
      }
      toast.success('Paramètres de facturation enregistrés avec succès');
    } finally {
      setBusyInvoicing(false);
    }
  }

  if (!company || !invoicing) {
    return (
      <div className="p-8 space-y-6 max-w-5xl mx-auto">
        <div className="h-20 animate-pulse rounded-2xl bg-slate-200" />
        <div className="grid gap-6 md:grid-cols-2">
          <div className="h-96 animate-pulse rounded-3xl bg-slate-200" />
          <div className="h-96 animate-pulse rounded-3xl bg-slate-200" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-6xl mx-auto">
      {/* ── HEADER ───────────────────────────────────────────────────────── */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-200 pb-6 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700 border border-blue-200">
              <ShieldCheck size={13} /> Module Fiscalité & Factures
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            Facturation & Identité Légale
          </h1>
          <p className="mt-1 text-sm text-slate-500 max-w-2xl">
            Configurez les coordonnées officielles de l&apos;entreprise, les taux de TVA et le timbre fiscal figurant sur vos documents.
          </p>
        </div>

        {/* Live Status Pill */}
        <div className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-black border shadow-xs ${
          invoicing.enabled
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-amber-50 text-amber-800 border-amber-200'
        }`}>
          <span className={`h-2.5 w-2.5 rounded-full ${invoicing.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          {invoicing.enabled ? 'Facturation Officielle Active' : 'Facturation en Mode Brouillon'}
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* ── SECTION 1: ENTREPRISE (Left 7 Cols) ─────────────────────────── */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-3xl bg-white border border-slate-200/80 p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-blue-50 p-3 text-blue-600">
                  <Building2 size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900">Profil Entreprise</h2>
                  <p className="text-xs text-slate-500">Mentions légales obligatoires figurant sur les factures et devis</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {/* Legal Name */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  Raison sociale / Nom commercial <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Landmark size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-4 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 transition"
                    value={company.legalName}
                    onChange={(e) => setCompany({ ...company, legalName: e.target.value })}
                    placeholder="Ex. Mzali Boutique S.A.R.L"
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  Adresse du siège social <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <MapPin size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-4 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 transition"
                    value={company.address}
                    onChange={(e) => setCompany({ ...company, address: e.target.value })}
                    placeholder="Ex. Rue Habib Bourguiba, Monastir 5000"
                  />
                </div>
              </div>

              {/* MF & RC Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                    Matricule Fiscal (MF) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Hash size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-4 text-sm font-bold text-slate-900 font-mono outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 transition"
                      value={company.matriculeFiscal}
                      onChange={(e) => setCompany({ ...company, matriculeFiscal: e.target.value })}
                      placeholder="Ex. 1234567A/P/M/000"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                    Registre de Commerce (RC)
                  </label>
                  <div className="relative">
                    <FileText size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-4 text-sm font-bold text-slate-900 font-mono outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 transition"
                      value={company.rcNumber}
                      onChange={(e) => setCompany({ ...company, rcNumber: e.target.value })}
                      placeholder="Ex. B01122332024"
                    />
                  </div>
                </div>
              </div>

              {/* Phone & Email Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                    Téléphone officiel
                  </label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="tel"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-4 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 transition"
                      value={company.phone}
                      onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                      placeholder="Ex. +216 22 479 443"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                    Email de facturation
                  </label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-4 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 transition"
                      value={company.email}
                      onChange={(e) => setCompany({ ...company, email: e.target.value })}
                      placeholder="Ex. contact@mzali.tn"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                disabled={busyCompany}
                onClick={saveCompany}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 active:scale-[0.98] transition disabled:opacity-40"
              >
                <Save size={16} />
                {busyCompany ? 'Enregistrement…' : 'Enregistrer la société'}
              </button>
            </div>
          </div>
        </div>

        {/* ── SECTION 2: REGLES FISCALES & PREVIEW (Right 5 Cols) ──────────── */}
        <div className="lg:col-span-5 space-y-6">
          {/* Rules Card */}
          <div className="rounded-3xl bg-white border border-slate-200/80 p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-indigo-50 p-3 text-indigo-600">
                  <Receipt size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900">Règles Fiscales</h2>
                  <p className="text-xs text-slate-500">Taux de TVA et timbre fiscal (Loi tunisienne)</p>
                </div>
              </div>
            </div>

            {/* Warning banner */}
            <div className={`rounded-2xl p-4 text-xs font-medium space-y-1.5 border ${
              invoicing.enabled
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}>
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertTriangle size={16} className={invoicing.enabled ? 'text-emerald-600' : 'text-amber-600'} />
                {invoicing.enabled ? 'Facturation active' : 'Facturation désactivée'}
              </div>
              <p className="leading-relaxed">
                {invoicing.enabled
                  ? 'Les factures émises comportent un numéro séquentiel inaltérable et sont verrouillées dès confirmation.'
                  : 'En mode désactivé, vous pouvez prévisualiser et imprimer des factures brouillons sans valider les numéros comptables définitifs.'}
              </p>
            </div>

            {/* Toggle switch */}
            <label className="flex items-center justify-between cursor-pointer rounded-2xl border border-slate-200 p-4 bg-slate-50/50 hover:bg-slate-50 transition">
              <div>
                <span className="block text-sm font-bold text-slate-900">Activer la facturation officielle</span>
                <span className="text-xs text-slate-500">Autorise la finalisation et le numérotage comptable</span>
              </div>
              <div
                onClick={() => setInvoicing({ ...invoicing, enabled: !invoicing.enabled })}
                className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${
                  invoicing.enabled ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                  invoicing.enabled ? 'translate-x-5' : 'translate-x-0.5'
                }`} />
              </div>
            </label>

            {/* TVA & Timbre inputs */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  Taux TVA (%)
                </label>
                <div className="relative">
                  <Percent size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-4 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 transition"
                    value={invoicing.tvaRatePercent}
                    onChange={(e) => setInvoicing({ ...invoicing, tvaRatePercent: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  Timbre Fiscal (DT)
                </label>
                <div className="relative">
                  <Stamp size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="number"
                    min={0}
                    step={0.001}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-4 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 transition"
                    value={invoicing.timbreFiscalMinor / 1000}
                    onChange={(e) => setInvoicing({ ...invoicing, timbreFiscalMinor: Math.round(Number(e.target.value) * 1000) })}
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                disabled={busyInvoicing}
                onClick={saveInvoicing}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 active:scale-[0.98] transition disabled:opacity-40"
              >
                <Save size={16} />
                {busyInvoicing ? 'Enregistrement…' : 'Enregistrer la fiscalité'}
              </button>
            </div>
          </div>

          {/* Quick Invoice Spec summary card */}
          <div className="rounded-3xl bg-gradient-to-br from-slate-900 to-slate-950 p-6 text-white shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">Rappel du format PDF</span>
              <Sparkles size={16} className="text-blue-400" />
            </div>
            <div>
              <p className="text-base font-black">Design Corporate Bleu & Séquence</p>
              <p className="text-xs text-slate-400 mt-1">
                Toutes les factures et devis sont générés selon le modèle corporate unifié bleu.
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 p-3.5 text-xs space-y-1.5 border border-white/10 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">MF :</span>
                <span className="font-bold text-white">{company.matriculeFiscal || 'Non renseigné'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">TVA appliquée :</span>
                <span className="font-bold text-blue-300">{invoicing.tvaRatePercent}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Timbre fiscal :</span>
                <span className="font-bold text-blue-300">{(invoicing.timbreFiscalMinor / 1000).toFixed(3)} DT</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
