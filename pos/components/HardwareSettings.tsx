'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, ChevronDown, CircleAlert, Loader2, PlugZap, Printer, RefreshCw, Save, Settings2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  type DrawerSettings,
  getBridgeStatus,
  getDrawerSettings,
  getLocalPrinters,
  openManualDrawer,
  updateDrawerSettings,
} from '@/lib/hardware';

const DEFAULT_SETTINGS: DrawerSettings = {
  autoOpenEnabled: true,
  openOnCashPayment: true,
  openForAllPaymentMethods: false,
  drawerPin: 0,
  pulseOnMs: 25,
  pulseOffMs: 250,
  printerName: '',
  autoPrintReceipt: false,
};

type Feedback = { tone: 'success' | 'error'; message: string };

export default function HardwareSettings() {
  const router = useRouter();
  const [settings, setSettings] = useState<DrawerSettings>(DEFAULT_SETTINGS);
  const [printers, setPrinters] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState<'connect' | 'save' | 'test' | null>('connect');
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const connect = useCallback(async () => {
    setBusy('connect');
    setFeedback(null);
    try {
      await getBridgeStatus();
      const [settingsResult, printersResult] = await Promise.all([getDrawerSettings(), getLocalPrinters()]);
      setSettings(settingsResult.settings);
      setPrinters(printersResult.printers);
      setConnected(true);
      setFeedback(settingsResult.settings.printerName
        ? { tone: 'success', message: `Prêt. Imprimante détectée : ${settingsResult.settings.printerName}` }
        : { tone: 'error', message: 'Service connecté, mais aucune imprimante Windows par défaut n’a été trouvée.' });
    } catch (error) {
      setConnected(false);
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'Connexion impossible.' });
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => { void connect(); }, [connect]);

  async function save() {
    setBusy('save');
    setFeedback(null);
    try {
      const result = await updateDrawerSettings(settings);
      setSettings(result.settings);
      setConnected(true);
      setFeedback({ tone: 'success', message: 'Réglages enregistrés sur ce terminal.' });
    } catch (error) {
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'Enregistrement impossible.' });
    } finally {
      setBusy(null);
    }
  }

  async function testDrawer() {
    setBusy('test');
    setFeedback(null);
    try {
      const result = await updateDrawerSettings(settings);
      setSettings(result.settings);
      await openManualDrawer('test');
      setFeedback({ tone: 'success', message: 'Commande envoyée. Le tiroir doit être ouvert.' });
    } catch (error) {
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'Le test a échoué.' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => router.push('/till')} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" aria-label="Retour à la caisse"><ArrowLeft size={18} /></button>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-blue-600">Configuration automatique</p>
              <h1 className="text-2xl font-black">Imprimante et tiroir-caisse</h1>
            </div>
          </div>
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black ${connected ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
            <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {busy === 'connect' ? 'Détection…' : connected ? 'Prêt' : 'Service arrêté'}
          </span>
        </header>

        {feedback && (
          <div role="status" aria-live="polite" className={`mb-4 flex items-start gap-2 rounded-2xl border p-4 text-sm font-semibold ${feedback.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-950'}`}>
            {feedback.tone === 'success' ? <CheckCircle2 className="mt-0.5 shrink-0" size={18} /> : <CircleAlert className="mt-0.5 shrink-0" size={18} />}
            <span>{feedback.message}</span>
          </div>
        )}

        <section className="mb-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700"><PlugZap size={20} /></div>
              <div>
                <h2 className="font-black">Aucune adresse ni secret à configurer</h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">Le POS se connecte automatiquement au service de ce PC et utilise l’imprimante par défaut de Windows.</p>
              </div>
            </div>
            <button type="button" disabled={busy !== null} onClick={() => void connect()} className="btn-ghost min-h-12 shrink-0">
              {busy === 'connect' ? <Loader2 className="animate-spin" size={17} /> : <RefreshCw size={17} />} Réessayer
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-slate-700"><Printer size={20} /></div>
            <div><h2 className="font-black">Ouverture après paiement</h2><p className="text-xs text-slate-500">Par défaut, le tiroir s’ouvre uniquement après un paiement en espèces réussi.</p></div>
          </div>

          <label className="mb-4 block text-xs font-bold text-slate-700">Imprimante détectée
            <select value={settings.printerName} onChange={(event) => setSettings((current) => ({ ...current, printerName: event.target.value }))} className="input mt-1.5 min-h-12 text-sm">
              <option value="">Imprimante Windows par défaut</option>
              {printers.map((printer) => <option key={printer} value={printer}>{printer}</option>)}
            </select>
          </label>

          <Toggle checked={settings.autoOpenEnabled && settings.openOnCashPayment} onChange={(value) => setSettings((current) => ({ ...current, autoOpenEnabled: value, openOnCashPayment: value }))} title="Ouvrir automatiquement pour les paiements en espèces" detail="La commande est envoyée une seule fois, après l’enregistrement réussi de la vente." />

          <details className="group mt-4 rounded-2xl border border-slate-200 bg-slate-50">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
              <span className="flex items-center gap-2"><Settings2 size={17} /> Réglages avancés</span>
              <ChevronDown className="transition group-open:rotate-180" size={17} />
            </summary>
            <div className="border-t border-slate-200 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Toggle checked={settings.openForAllPaymentMethods} onChange={(value) => setSettings((current) => ({ ...current, openForAllPaymentMethods: value }))} title="Tous les modes de paiement" detail="Inclut carte et virement. Désactivé par défaut." />
                <Toggle checked={settings.autoPrintReceipt} onChange={(value) => setSettings((current) => ({ ...current, autoPrintReceipt: value }))} title="Imprimer après paiement" detail="Ouvre automatiquement l’impression du ticket." />
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <label className="text-xs font-bold text-slate-700">Broche du tiroir
                  <select value={settings.drawerPin} onChange={(event) => setSettings((current) => ({ ...current, drawerPin: Number(event.target.value) === 1 ? 1 : 0 }))} className="input mt-1.5 min-h-12 text-sm">
                    <option value={0}>Pin 2 (m = 0)</option><option value={1}>Pin 5 (m = 1)</option>
                  </select>
                </label>
                <NumberField label="Impulsion ON" value={settings.pulseOnMs} onChange={(value) => setSettings((current) => ({ ...current, pulseOnMs: value }))} />
                <NumberField label="Impulsion OFF" value={settings.pulseOffMs} onChange={(value) => setSettings((current) => ({ ...current, pulseOffMs: value }))} />
              </div>
            </div>
          </details>

          <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-200 pt-5">
            <button type="button" disabled={busy !== null || !connected} onClick={() => void testDrawer()} className="btn-primary min-h-12"><Printer size={17} /> {busy === 'test' ? 'Test en cours…' : 'Tester le tiroir'}</button>
            <button type="button" disabled={busy !== null || !connected} onClick={() => void save()} className="btn-ghost min-h-12"><Save size={17} /> {busy === 'save' ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </section>
      </div>
    </main>
  );
}

function Toggle({ checked, onChange, title, detail }: { checked: boolean; onChange: (value: boolean) => void; title: string; detail: string }) {
  return (
    <label className="flex min-h-[72px] cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 transition hover:bg-slate-50">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-blue-600" />
      <span><span className="block text-sm font-black">{title}</span><span className="block text-[11px] font-medium leading-5 text-slate-500">{detail}</span></span>
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="text-xs font-bold text-slate-700">{label}
      <input type="number" min={1} max={255} value={value} onChange={(event) => onChange(Math.min(255, Math.max(1, Number(event.target.value) || 1)))} className="input mt-1.5 min-h-12 text-sm" />
    </label>
  );
}
