'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, CircleAlert, Loader2, PlugZap, Printer, Save, Settings2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  type BridgeConnection,
  type DrawerSettings,
  getBridgeConnection,
  getBridgeStatus,
  getDrawerSettings,
  getLocalPrinters,
  openManualDrawer,
  saveBridgeConnection,
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
  const [connection, setConnection] = useState<BridgeConnection>({ url: 'http://127.0.0.1:17890', token: '' });
  const [settings, setSettings] = useState<DrawerSettings>(DEFAULT_SETTINGS);
  const [printers, setPrinters] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState<'connect' | 'save' | 'test' | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => { setConnection(getBridgeConnection()); }, []);

  async function connect() {
    setBusy('connect');
    setFeedback(null);
    try {
      const safe = saveBridgeConnection(connection);
      await getBridgeStatus(safe);
      const [settingsResult, printersResult] = await Promise.all([getDrawerSettings(safe), getLocalPrinters(safe)]);
      setSettings(settingsResult.settings);
      setPrinters(printersResult.printers);
      setConnected(true);
      setFeedback({ tone: 'success', message: 'Pont matériel local connecté.' });
    } catch (error) {
      setConnected(false);
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'Connexion impossible.' });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy('save');
    setFeedback(null);
    try {
      const safe = saveBridgeConnection(connection);
      const result = await updateDrawerSettings(settings, safe);
      setSettings(result.settings);
      setConnected(true);
      setFeedback({ tone: 'success', message: 'Réglages matériels enregistrés sur ce terminal.' });
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
      const safe = saveBridgeConnection(connection);
      await updateDrawerSettings(settings, safe);
      await openManualDrawer('test');
      setFeedback({ tone: 'success', message: 'Impulsion envoyée. Le tiroir doit être ouvert.' });
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
            <button onClick={() => router.push('/till')} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50" aria-label="Retour à la caisse"><ArrowLeft size={18} /></button>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-blue-600">Terminal local</p>
              <h1 className="text-2xl font-black">Imprimante et tiroir-caisse</h1>
            </div>
          </div>
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black ${connected ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-300 bg-white text-slate-600'}`}>
            <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-400'}`} />
            {connected ? 'Pont connecté' : 'Pont non vérifié'}
          </span>
        </header>

        {feedback && (
          <div role="status" aria-live="polite" className={`mb-4 flex items-start gap-2 rounded-2xl border p-4 text-sm font-semibold ${feedback.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-950'}`}>
            {feedback.tone === 'success' ? <CheckCircle2 className="mt-0.5 shrink-0" size={18} /> : <CircleAlert className="mt-0.5 shrink-0" size={18} />}
            <span>{feedback.message}</span>
          </div>
        )}

        <section className="mb-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-700"><PlugZap size={20} /></div>
            <div><h2 className="font-black">Connexion locale sécurisée</h2><p className="text-xs text-slate-500">Le secret reste dans le navigateur de ce terminal.</p></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-700">Adresse du pont
              <input value={connection.url} onChange={(event) => setConnection((current) => ({ ...current, url: event.target.value }))} className="input mt-1.5 min-h-12 text-sm" placeholder="http://127.0.0.1:17890" />
            </label>
            <label className="text-xs font-bold text-slate-700">Secret local
              <input type="password" autoComplete="off" value={connection.token} onChange={(event) => setConnection((current) => ({ ...current, token: event.target.value }))} className="input mt-1.5 min-h-12 text-sm" placeholder="32 caractères minimum" />
            </label>
          </div>
          <button type="button" disabled={busy !== null} onClick={connect} className="btn-ghost mt-4 min-h-12">
            {busy === 'connect' ? <Loader2 className="animate-spin" size={17} /> : <PlugZap size={17} />} Vérifier et charger
          </button>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-slate-700"><Settings2 size={20} /></div>
            <div><h2 className="font-black">Comportement du tiroir</h2><p className="text-xs text-slate-500">L’impulsion passe toujours par l’imprimante sélectionnée.</p></div>
          </div>

          <label className="mb-4 block text-xs font-bold text-slate-700">Imprimante de tickets
            <select value={settings.printerName} onChange={(event) => setSettings((current) => ({ ...current, printerName: event.target.value }))} className="input mt-1.5 min-h-12 text-sm">
              <option value="">Sélectionner une imprimante…</option>
              {printers.map((printer) => <option key={printer} value={printer}>{printer}</option>)}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle checked={settings.autoOpenEnabled} onChange={(value) => setSettings((current) => ({ ...current, autoOpenEnabled: value }))} title="Ouverture automatique" detail="Active le déclenchement après une vente." />
            <Toggle checked={settings.openOnCashPayment} onChange={(value) => setSettings((current) => ({ ...current, openOnCashPayment: value }))} title="Ouvrir pour les espèces" detail="Réglage recommandé pour les paiements CASH." />
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
          <p className="mt-2 text-[11px] font-medium text-slate-500">Valeurs ESC/POS de 1 à 255. Valeurs recommandées : 25 / 250.</p>

          <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-200 pt-5">
            <button type="button" disabled={busy !== null} onClick={save} className="btn-primary min-h-12"><Save size={17} /> {busy === 'save' ? 'Enregistrement…' : 'Enregistrer'}</button>
            <button type="button" disabled={busy !== null || !settings.printerName} onClick={testDrawer} className="btn-ghost min-h-12"><Printer size={17} /> {busy === 'test' ? 'Test en cours…' : 'Tester l’ouverture du tiroir'}</button>
          </div>
        </section>
      </div>
    </main>
  );
}

function Toggle({ checked, onChange, title, detail }: { checked: boolean; onChange: (value: boolean) => void; title: string; detail: string }) {
  return (
    <label className="flex min-h-[72px] cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 p-3 transition hover:bg-slate-50">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-blue-600" />
      <span><span className="block text-sm font-black">{title}</span><span className="block text-[11px] font-medium text-slate-500">{detail}</span></span>
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
