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
  const [countedCash, setCountedCash] = useState<string>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    posFetch('/api/sessions', { cache: 'no-store' })
      .then(async (res) => { const data = await res.json(); if (!res.ok) throw new Error(data.error ?? 'Caisse indisponible'); return data; })
      .then((body: { session: PosCashierSession | null }) => {
        const data = body.session;
        setSession(data);
        if (!data) return;
        return posFetch(`/api/sessions/${data.id}/report?type=X`, { cache: 'no-store' })
          .then(async (res) => { const data = await res.json(); if (!res.ok) throw new Error(data.error ?? 'Caisse indisponible'); return data; })
          .then((report) => setLiveReport(report));
      })
      .catch((e) => { setSession(null); setError(e instanceof Error ? e.message : 'Caisse indisponible'); });
  }, [router]);

  async function handleClose() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const res = await posFetch(`/api/sessions/${session.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closingCountedCashMinor: Math.round(Number(countedCash) * 1000), note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Impossible de fermer la session');
      const reportRes = await posFetch(`/api/sessions/${session.id}/report?type=Z`, { cache: 'no-store' });
      if (!reportRes.ok) throw new Error('Caisse fermée. Réessayez pour charger le Ticket Z archivé.');
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
          <p className="mb-3 font-bold text-ink-700">{error || 'Aucune session ouverte sur ce terminal.'}</p>
          <button onClick={() => router.replace('/')} className="btn-primary">Retour à la caisse</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-ink-100 px-4 py-4 sm:px-6">
      <div className={`mx-auto w-full ${zReport ? 'max-w-xl' : 'max-w-5xl'}`}>
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
            <Wallet size={23} />
          </div>
          <h1 className="text-xl font-black text-ink-900">Fermeture de caisse</h1>
        </div>

        {!zReport ? (
          <div className="grid items-start gap-4 md:grid-cols-2 lg:gap-6">
            {liveReport && <div className="order-2 min-w-0 md:order-1"><SessionReport report={liveReport} /></div>}
            <div className="order-1 min-w-0 rounded-2xl border border-ink-200 bg-white p-4 shadow-sm sm:p-5 md:order-2">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-50 px-4 py-3 text-brand-700">
                <span className="text-sm font-bold">Espèces attendues</span>
                <span className="text-xl font-black tabular-nums">{liveReport ? formatMinor(liveReport.expectedCashMinor) : 'Chargement…'}</span>
              </div>
              <label className="mb-1.5 block text-xs font-bold uppercase text-ink-700">Espèces comptées en caisse</label>
              <input
                type="number"
                className="input mb-2 text-center text-2xl font-black"
                aria-label="Montant compté en caisse (DT)"
                value={countedCash}
                min={0}
                step={0.001}
                onChange={(e) => setCountedCash(e.target.value)}
              />
              <p className="mb-4 text-center text-sm text-ink-500">{countedCash !== '' && liveReport ? `Écart : ${formatMinor(Math.round(Number(countedCash) * 1000) - liveReport.expectedCashMinor)}` : 'Saisissez le montant réellement compté.'}</p>

              <label className="mb-4 block text-sm font-bold">Note de clôture (facultative)<textarea rows={2} maxLength={1000} className="input mt-2" value={note} onChange={(e) => setNote(e.target.value)} /></label>
              {error && (
                <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-center text-sm font-bold text-red-700">{error}</p>
              )}

              <button type="button" disabled={busy || !liveReport || countedCash.trim() === '' || !Number.isFinite(Number(countedCash)) || Number(countedCash) < 0} onClick={handleClose} className="btn-primary min-h-16 w-full text-lg disabled:opacity-40">
                {busy ? 'Fermeture…' : 'FERMER LA CAISSE'}
              </button>
            </div>
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
