'use client';
import { useState } from 'react';
import type { Product } from '@/types';
export default function VariantSelector({ variants, value, onChange, stockEnabled }: { variants: NonNullable<Product['variants']>; value?: string; onChange: (id: string) => void; stockEnabled: boolean }) {
  const selected = variants.find(v => v.id === value);
  const [color, setColor] = useState(selected?.color ?? variants.find(v => v.active)?.color ?? '');
  const colors = [...new Set(variants.filter(v => v.active).map(v => v.color))];
  return <div className="space-y-3 text-ink-900"><div><p className="mb-2 text-sm font-bold">Couleur</p><div className="flex flex-wrap gap-2">{colors.map(c => <button type="button" aria-pressed={color === c} key={c} className={`rounded-xl border px-4 py-2 text-sm font-bold ${color === c ? 'border-brand-500 bg-brand-50' : 'bg-white'}`} onClick={() => { setColor(c); onChange(''); }}>{c}</button>)}</div></div><div><p className="mb-2 text-sm font-bold">Taille</p><div className="flex flex-wrap gap-2">{variants.filter(v => v.color === color && v.active).map(v => { const sold = stockEnabled && v.available <= 0; return <button type="button" key={v.id} disabled={sold} aria-pressed={value === v.id} onClick={() => onChange(v.id)} className={`rounded-xl border px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:bg-ink-100 disabled:text-ink-400 ${value === v.id ? 'border-brand-500 bg-brand-50' : 'bg-white'}`}>{v.size}{sold && ' · Épuisé'}</button>; })}</div></div></div>;
}
