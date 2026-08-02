'use client';
import { useState } from 'react';
import { Award, Search } from 'lucide-react';

type LookupResult =
  | { found: true; cardNumber: string; pointsBalance: number; lifetimePointsEarned: number; status: string }
  | { found: false };

export default function FideliteLookup() {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [searched, setSearched] = useState(false);

  async function search() {
    const trimmed = value.trim();
    if (!trimmed) return;
    setLoading(true);
    setSearched(true);
    try {
      const isPhone = /^\d[\d\s]*$/.test(trimmed);
      const param = isPhone ? `phone=${encodeURIComponent(trimmed)}` : `card=${encodeURIComponent(trimmed)}`;
      const res = await fetch(`/api/loyalty/lookup?${param}`, { cache: 'no-store' });
      const data: LookupResult = await res.json();
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="Téléphone ou numéro de carte"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
        />
        <button onClick={search} disabled={loading || !value.trim()} className="btn-primary inline-flex items-center gap-2 disabled:opacity-40">
          <Search size={16} /> Rechercher
        </button>
      </div>

      {searched && !loading && (
        result?.found ? (
          <div className="mt-6 rounded-2xl bg-brand-50 p-6 text-center">
            <Award size={32} className="mx-auto mb-2 text-brand-600" />
            <p className="text-sm font-bold text-ink-700">Carte {result.cardNumber}</p>
            <p className="my-2 text-4xl font-black text-brand-700">{result.pointsBalance} pts</p>
            <p className="text-xs text-ink-500">{result.lifetimePointsEarned} points gagnés au total</p>
            {result.status !== 'ACTIVE' && (
              <p className="mt-3 text-sm font-bold text-red-600">Ce compte est suspendu.</p>
            )}
          </div>
        ) : (
          <p className="mt-6 text-center text-sm font-bold text-ink-700">
            Aucun compte trouvé. Demandez à un vendeur en boutique pour créer votre carte fidélité.
          </p>
        )
      )}
    </div>
  );
}
