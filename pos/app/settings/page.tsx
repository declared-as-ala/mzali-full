'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Printer, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { posFetch } from '@/lib/device';
import { getBridgeStatus, listPrinters, printReceiptOnBridge, type PrinterInfo } from '@/lib/hardware';
import NavBar from '@/components/NavBar';
import type { PosPrinterSettings, PosSale } from '@/types/pos';

const DEFAULT_SETTINGS: PosPrinterSettings = {
  printerName: null,
  paperWidthMm: 80,
  printCopies: 1,
  autoPrint: true,
  autoOpenDrawer: true,
  printLogo: true,
  printQr: true,
};

/** Minimal fake sale used only for the "Test print" button — never sent to
 *  the backend, exists purely to exercise buildReceipt() end to end. */
function testSale(): PosSale {
  const now = new Date().toISOString();
  return {
    id: 'test', saleNumber: 0, terminalId: '', registerId: null, cashierId: '', cashierName: 'Test',
    sessionId: '', locationId: '', status: 'COMPLETED',
    lines: [{
      variantId: 'test', productId: 'test', descriptionSnapshot: 'Article de test', sku: 'TEST-001',
      variantAttributesSnapshot: {}, qty: 1, unitPriceMinor: 10000, discountMinor: 0, lineTotalMinor: 10000,
      bundleGroupId: null, bundleId: null, bundleName: null, regularUnitPriceMinor: 10000,
    }],
    customerId: null, customerName: null, customerPhone: null,
    merchant: { legalName: '', address: '', phone: '', matriculeFiscal: '', rcNumber: '' },
    subtotalMinor: 10000, discountMinor: 0, totalMinor: 10000,
    paymentMethod: 'CASH', payments: [{ method: 'CASH', amountMinor: 10000 }],
    cashReceivedMinor: 10000, changeMinor: 0,
    loyaltyPointsEarned: 0, loyaltyPointsRedeemed: 0, loyaltyDiscountMinor: 0,
    notes: null, createdAt: now, completedAt: now, printStatus: 'pending', printedAt: null,
  };
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left transition hover:border-slate-300"
    >
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-800">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
      <span
        className={`relative h-7 w-12 flex-none rounded-full transition ${checked ? 'bg-blue-600' : 'bg-slate-300'}`}
        aria-hidden="true"
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'left-6' : 'left-1'}`} />
      </span>
    </button>
  );
}

export default function PrinterSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<PosPrinterSettings>(DEFAULT_SETTINGS);
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [bridgeOnline, setBridgeOnline] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const refreshPrinters = useCallback(async () => {
    try {
      await getBridgeStatus();
      setBridgeOnline(true);
      setPrinters(await listPrinters());
    } catch {
      setBridgeOnline(false);
      setPrinters([]);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      posFetch('/api/printer/settings', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : DEFAULT_SETTINGS)),
      refreshPrinters(),
    ])
      .then(([loaded]) => setSettings({ ...DEFAULT_SETTINGS, ...loaded }))
      .finally(() => setLoading(false));
  }, [refreshPrinters]);

  function update<K extends keyof PosPrinterSettings>(key: K, value: PosPrinterSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await posFetch('/api/printer/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Erreur');
      setSettings({ ...DEFAULT_SETTINGS, ...data });
      setMessage({ tone: 'success', text: 'Paramètres enregistrés.' });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Erreur' });
    } finally {
      setSaving(false);
    }
  }

  async function testPrint() {
    setTesting(true);
    setMessage(null);
    try {
      await printReceiptOnBridge(testSale(), settings);
      setMessage({ tone: 'success', text: 'Ticket de test envoyé à l’imprimante.' });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Échec du test d’impression.' });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-400">Chargement…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/till')} className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Retour à la caisse">
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-base font-black text-slate-900">Réglages imprimante</h1>
        </div>
        <NavBar />
      </header>

      <main className="mx-auto max-w-xl px-5 py-6">
        <div className={`mb-5 flex items-center gap-2 rounded-2xl border px-4 py-3 text-xs font-bold ${
          bridgeOnline ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'
        }`}>
          {bridgeOnline ? <Wifi size={15} /> : <WifiOff size={15} />}
          {bridgeOnline
            ? 'Pont matériel MZALI POS connecté.'
            : 'Pont matériel MZALI POS introuvable — installez/démarrez « MZALI POS Bridge » sur ce PC pour imprimer automatiquement.'}
          <button onClick={() => void refreshPrinters()} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-black/5">
            <RefreshCw size={12} /> Actualiser
          </button>
        </div>

        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
          <label className="mb-1.5 block text-xs font-bold uppercase text-slate-500">Imprimante</label>
          {printers.length > 0 ? (
            <select
              className="input"
              value={settings.printerName ?? ''}
              onChange={(e) => update('printerName', e.target.value || null)}
            >
              <option value="">Sélectionner une imprimante…</option>
              {printers.map((p) => (
                <option key={p.name} value={p.name}>{p.name}{p.isDefault ? ' (par défaut)' : ''} — {p.status}</option>
              ))}
            </select>
          ) : (
            <input
              className="input"
              placeholder="Nom exact de l’imprimante Windows"
              value={settings.printerName ?? ''}
              onChange={(e) => update('printerName', e.target.value || null)}
            />
          )}
          <p className="mt-1.5 text-xs text-slate-500">
            {printers.length > 0
              ? `${printers.length} imprimante(s) détectée(s) sur ce PC.`
              : 'Liste indisponible — le pont matériel doit être en ligne pour détecter les imprimantes. Vous pouvez saisir le nom manuellement.'}
          </p>
        </section>

        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
          <label className="mb-2 block text-xs font-bold uppercase text-slate-500">Largeur du papier</label>
          <div className="grid grid-cols-2 gap-2">
            {([58, 80] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => update('paperWidthMm', w)}
                className={`rounded-xl border px-4 py-3 text-sm font-black transition ${
                  settings.paperWidthMm === w ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {w} mm
              </button>
            ))}
          </div>

          <label className="mb-1.5 mt-4 block text-xs font-bold uppercase text-slate-500">Nombre de copies</label>
          <input
            type="number" min={1} max={5} className="input"
            value={settings.printCopies}
            onChange={(e) => update('printCopies', Math.min(5, Math.max(1, Number(e.target.value) || 1)))}
          />
        </section>

        <section className="mb-5 space-y-2.5">
          <Toggle
            checked={settings.autoPrint}
            onChange={(v) => update('autoPrint', v)}
            label="Impression automatique"
            hint="Imprime le ticket dès qu’un paiement est encaissé, sans confirmation."
          />
          <Toggle
            checked={settings.autoOpenDrawer}
            onChange={(v) => update('autoOpenDrawer', v)}
            label="Ouverture automatique du tiroir"
            hint="Ouvre le tiroir-caisse après un paiement en espèces."
          />
          <Toggle checked={settings.printLogo} onChange={(v) => update('printLogo', v)} label="En-tête boutique en gras" />
          <Toggle checked={settings.printQr} onChange={(v) => update('printQr', v)} label="QR code sur le ticket" />
        </section>

        {message && (
          <p className={`mb-4 rounded-xl px-3 py-2 text-center text-sm font-bold ${
            message.tone === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          }`}>
            {message.text}
          </p>
        )}

        <div className="flex gap-2">
          <button onClick={() => void testPrint()} disabled={testing || !bridgeOnline} className="btn-ghost min-h-14 flex-1 disabled:opacity-40">
            <Printer size={16} /> {testing ? 'Impression…' : 'Test d’impression'}
          </button>
          <button onClick={() => void save()} disabled={saving} className="btn-primary min-h-14 flex-1 disabled:opacity-60">
            <Check size={16} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </main>
    </div>
  );
}
