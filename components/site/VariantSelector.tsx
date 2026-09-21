'use client';
import { useState } from 'react';
import type { Product } from '@/types';

export default function VariantSelector({
  variants,
  value,
  onChange,
  stockEnabled,
}: {
  variants: NonNullable<Product['variants']>;
  value?: string;
  onChange: (id: string) => void;
  stockEnabled: boolean;
}) {
  const selected = variants.find((v) => v.id === value);
  const [color, setColor] = useState(
    selected?.color ?? variants.find((v) => v.active)?.color ?? '',
  );

  const colors = [...new Set(variants.filter((v) => v.active).map((v) => v.color))];

  return (
    <div className="space-y-4 text-ink-900">
      {/* Color selector */}
      <div>
        <p className="mb-2 text-sm font-bold">Couleur</p>
        <div className="flex flex-wrap gap-2">
          {colors.map((c) => (
            <button
              type="button"
              aria-pressed={color === c}
              key={c}
              className={`rounded-xl border px-4 py-2 text-sm font-bold transition ${
                color === c
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'bg-white hover:border-brand-300'
              }`}
              onClick={() => {
                setColor(c);
                onChange('');
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Size selector */}
      <div>
        <p className="mb-2 text-sm font-bold">Taille</p>
        <div className="flex flex-wrap gap-2">
          {variants
            .filter((v) => v.color === color && v.active)
            .map((v) => {
              const sold = stockEnabled && v.available <= 0;
              const isSelected = value === v.id;
              return (
                <button
                  type="button"
                  key={v.id}
                  disabled={sold}
                  aria-pressed={isSelected}
                  aria-disabled={sold}
                  onClick={() => onChange(v.id)}
                  className={`relative rounded-xl border px-4 py-2 text-sm font-bold transition ${
                    sold
                      ? 'cursor-not-allowed border-red-200 bg-red-50 text-red-400 line-through'
                      : isSelected
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'bg-white hover:border-brand-300'
                  }`}
                >
                  {v.size}
                  {sold && (
                    <span className="sr-only"> — Épuisé</span>
                  )}
                  {sold && (
                    <span
                      aria-hidden="true"
                      className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-black text-white"
                      title="Épuisé"
                    >
                      ✕
                    </span>
                  )}
                </button>
              );
            })}
        </div>
        <p className="mt-1.5 text-[11px] text-ink-400">
          Les tailles barrées sont épuisées.
        </p>
      </div>
    </div>
  );
}
