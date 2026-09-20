'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet } from 'lucide-react';
import { posFetch } from '@/lib/device';
import { formatMinor } from '@/lib/money';

export default function OpenCashSession({ onCancel }: { onCancel?: () => void }) {
  const router = useRouter();
  const [openingCash, setOpeningCash] = useState<number>(0);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    posFetch('/api/sessions', { cache: 'no-store' })
      .then(async (res) => { const data = await res.json(); if (!res.ok) throw new Error(data.error ?? 'Caisse indisponible'); return data; })
      .then((data: { session: unknown }) => { if (data.session) router.replace('/till'); else setChecking(false); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Caisse indisponible'));
  }, [router]);

  async function handleOpen() {
    setBusy(true);
    setError(null);
    try {
      const current = await posFetch('/api/sessions', { cache: 'no-store' });
      const existing = await current.json();
      if (!current.ok) throw new Error(existing.error ?? 'Caisse indisponible');
      if (existing.session) { router.replace('/till'); return; }
      const res = await posFetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openingCashMinor: openingCash }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Impossible d'ouvrir la session");
      router.replace('/till');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900/40 p-6">
      <div role="dialog" aria-modal="true" aria-label="Ouverture de caisse" className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl" onKeyDown={(e) => { if (e.key === 'Escape' && !busy) onCancel?.(); }}>
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
            <Wallet size={26} />
          </div>
          <h1 className="mt-4 text-xl font-black text-ink-900">Ouverture de caisse</h1>
          <p className="mt-1 text-sm text-ink-500">Indiquez le fond de caisse initial en espèces.</p>
        </div>

        <label className="mb-1.5 block text-xs font-bold uppercase text-ink-700">Fond de caisse initial (DT)</label>
        <input
          type="number"
          autoFocus
          aria-label="Fond de caisse initial (DT)"
          className="input mb-2 text-center text-2xl font-black"
          value={openingCash / 1000}
          min={0}
          step={0.001}
          onChange={(e) => setOpeningCash(Math.max(0, Math.round(Number(e.target.value || 0) * 1000)))}
        />
        <p className="mb-5 text-center text-sm text-ink-500">{formatMinor(openingCash)}</p>

        {error && (
          <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-center text-sm font-bold text-red-700">{error}</p>
        )}

        <button type="button" disabled={busy || checking} onClick={handleOpen} className="btn-primary min-h-16 w-full text-lg disabled:opacity-40">
          {checking ? 'Vérification de la caisse…' : busy ? 'Ouverture…' : 'OUVRIR LA CAISSE'}
        </button>
        {onCancel && <button className="btn-ghost mt-3 w-full" disabled={busy} onClick={onCancel}>Annuler</button>}
      </div>
    </div>
  );
}
