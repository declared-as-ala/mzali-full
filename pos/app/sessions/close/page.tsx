'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet } from 'lucide-react';
import { posFetch } from '@/lib/device';
import { formatMinor } from '@/lib/money';
import SessionReport from '@/components/SessionReport';
import type { PosCashierSession, PosSessionReport } from '@/types/pos';

export default function CloseSessionPage() {
  const router = useRouter();
  const [session, setSession] = useState<PosCashierSession | null | undefined>(undefined);
  const [liveReport, setLiveReport] = useState<PosSessionReport | null>(null);
  const [zReport, setZReport] = useState<PosSessionReport | null>(null);
  const [countedCash, setCountedCash] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    posFetch('/api/sessions', { cache: 'no-store' })
      .then((res) => res.json())
      .then((body: { session: PosCashierSession | null }) => {
        const data = body.session;
        setSession(data);
        if (!data) return;
        return posFetch(`/api/sessions/${data.id}/report?type=X`, { cache: 'no-store' })
          .then((res) => res.json())
          .then((report) => setLiveReport(report));
      })
      .catch(() => {});
  }, [router]);

  async function handleClose() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const res = await posFetch(`/api/sessions/${session.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closingCountedCashMinor: countedCash }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Impossible de fermer la session');
      const reportRes = await posFetch(`/api/sessions/${session.id}/report?type=Z`, { cache: 'no-store' });
      setZReport(await reportRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    await fetch('/api/auth', { method: 'DELETE' });
    router.replace('/login');
  }

  if (session === undefined) {
    return <div className="grid min-h-screen place-items-center bg-ink-100" />;
  }

  if (session === null && !zReport) {
    return (
      <div className="grid min-h-screen place-items-center bg-ink-100 p-6 text-center">
        <div>
          <p className="mb-3 font-bold text-ink-700">Aucune session ouverte sur ce terminal.</p>
          <button onClick={() => router.replace('/')} className="btn-primary">Retour à la caisse</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-ink-100 p-6">
      <div className="w-full max-w-md">
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
            <Wallet size={26} />
          </div>
          <h1 className="mt-4 text-xl font-black text-ink-900">Fermeture de caisse</h1>
        </div>

        {liveReport && !zReport && <SessionReport report={liveReport} />}

        {!zReport ? (
          <div className="mt-5 rounded-3xl bg-white p-6 shadow-2xl">
            <label className="mb-1.5 block text-xs font-bold uppercase text-ink-700">Espèces comptées en caisse</label>
            <input
              type="number"
              className="input mb-2 text-center text-2xl font-black"
              value={countedCash / 1000}
              min={0}
              step={0.1}
              onChange={(e) => setCountedCash(Math.max(0, Math.round(Number(e.target.value || 0) * 1000)))}
            />
            <p className="mb-5 text-center text-sm text-ink-500">{formatMinor(countedCash)}</p>

            {error && (
              <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-center text-sm font-bold text-red-700">{error}</p>
            )}

            <button type="button" disabled={busy} onClick={handleClose} className="btn-primary min-h-16 w-full text-lg disabled:opacity-40">
              {busy ? 'Fermeture…' : 'FERMER LA CAISSE'}
            </button>
          </div>
        ) : (
          <div className="mt-5">
            <SessionReport report={zReport} />
            <button type="button" onClick={finish} className="btn-primary mt-4 min-h-16 w-full text-lg">
              TERMINER
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
