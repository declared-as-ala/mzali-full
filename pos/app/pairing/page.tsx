'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MonitorSmartphone, Wifi } from 'lucide-react';
import { getTerminalCode, posFetch, setTerminalCode } from '@/lib/device';

type PairingState = { pairingCode: string; expiresAt: string } | null;

export default function PairingPage() {
  const router = useRouter();
  const [pairing, setPairing] = useState<PairingState>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Already paired on this device — nothing to do here.
    if (getTerminalCode()) {
      router.replace('/login');
      return;
    }

    let cancelled = false;
    async function requestPairing() {
      try {
        const res = await posFetch('/api/terminal/pairing', { method: 'POST' });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) setPairing(data);
      } catch {
        if (!cancelled) setError("Impossible de contacter le serveur. Vérifiez la connexion.");
      }
    }
    requestPairing();
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    if (!pairing) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await posFetch(`/api/terminal/pairing/${pairing.pairingCode}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'approved' && data.terminalCode) {
          if (pollRef.current) clearInterval(pollRef.current);
          setTerminalCode(data.terminalCode);
          router.replace('/login');
        } else if (data.status === 'expired' || data.status === 'not_found') {
          if (pollRef.current) clearInterval(pollRef.current);
          setError('Code expiré. Rechargez la page pour en obtenir un nouveau.');
        }
      } catch { /* keep polling */ }
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [pairing, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-brand-700 to-brand-900 p-6 text-white">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-2xl font-black text-brand-700 shadow-soft">M</div>
      <h1 className="mt-6 text-2xl font-black">Associer ce terminal</h1>
      <p className="mt-2 max-w-sm text-center text-brand-100">
        Communiquez ce code à un administrateur pour approuver cette caisse.
      </p>

      {error && (
        <p className="mt-8 rounded-xl bg-red-500/20 px-4 py-3 text-center font-bold text-red-100">{error}</p>
      )}

      {!error && !pairing && (
        <div className="mt-10 h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
      )}

      {!error && pairing && (
        <div className="mt-10 flex flex-col items-center gap-4">
          <div className="rounded-3xl bg-white/10 px-10 py-8 text-center">
            <p className="text-5xl font-black tracking-[0.3em]">{pairing.pairingCode}</p>
          </div>
          <p className="flex items-center gap-2 text-sm text-brand-100">
            <Wifi size={14} className="animate-pulse" /> En attente d&apos;approbation…
          </p>
          <p className="flex items-center gap-2 text-xs text-brand-200">
            <MonitorSmartphone size={13} /> Admin → Point de vente → Terminaux POS
          </p>
        </div>
      )}
    </div>
  );
}
