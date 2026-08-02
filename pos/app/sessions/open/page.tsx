'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet } from 'lucide-react';
import { getTerminalCode, posFetch } from '@/lib/device';
import { formatMinor } from '@/lib/money';

export default function OpenSessionPage() {
  const router = useRouter();
  const [openingCash, setOpeningCash] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getTerminalCode()) { router.replace('/pairing'); return; }
    posFetch('/api/sessions', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: { session: unknown }) => { if (data.session) router.replace('/'); })
      .catch(() => {});
  }, [router]);

  async function handleOpen() {
    setBusy(true);
    setError(null);
    try {
      const res = await posFetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openingCashMinor: openingCash }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Impossible d'ouvrir la session");
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-100 p-6">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
            <Wallet size={26} />
          </div>
          <h1 className="mt-4 text-xl font-black text-ink-900">Ouverture de caisse</h1>
          <p className="mt-1 text-sm text-ink-500">Indiquez le fond de caisse initial en espèces.</p>
        </div>

        <label className="mb-1.5 block text-xs font-bold uppercase text-ink-700">Fond de caisse</label>
        <input
          type="number"
          className="input mb-2 text-center text-2xl font-black"
          value={openingCash / 1000}
          min={0}
          step={0.1}
          onChange={(e) => setOpeningCash(Math.max(0, Math.round(Number(e.target.value || 0) * 1000)))}
        />
        <p className="mb-5 text-center text-sm text-ink-500">{formatMinor(openingCash)}</p>

        {error && (
          <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-center text-sm font-bold text-red-700">{error}</p>
        )}

        <button type="button" disabled={busy} onClick={handleOpen} className="btn-primary min-h-16 w-full text-lg disabled:opacity-40">
          {busy ? 'Ouverture…' : 'OUVRIR LA CAISSE'}
        </button>
      </div>
    </div>
  );
}
