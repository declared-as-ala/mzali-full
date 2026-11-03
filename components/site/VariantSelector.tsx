'use client';

import { useState } from 'react';
import { Palette, Layers, Check } from 'lucide-react';
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
  const sizesForColor = variants.filter((v) => v.color === color && v.active);

  return (
    <div className="space-y-4 text-neutral-900">
      {/* Color Selector */}
      {colors.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-neutral-700">
            <span className="flex items-center gap-1.5 text-neutral-900 font-extrabold">
              <Palette size={15} className="text-blue-600" />
              <span>Couleur</span>
            </span>
            {color && <span className="font-extrabold text-blue-600 capitalize">{color}</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => {
              const isSelected = color === c;
              return (
                <button
                  type="button"
                  aria-pressed={isSelected}
                  key={c}
                  className={`h-10 min-w-[3rem] px-3.5 rounded-xl text-xs sm:text-sm font-bold transition-all duration-150 capitalize cursor-pointer flex items-center gap-1.5 justify-center ${
                    isSelected
                      ? 'bg-blue-600 hover:bg-blue-700 text-white font-black shadow-sm ring-2 ring-blue-100'
                      : 'bg-white hover:bg-neutral-50 text-neutral-800 border border-neutral-200/90 shadow-2xs'
                  }`}
                  onClick={() => {
                    setColor(c);
                    onChange('');
                  }}
                >
                  {isSelected && <Check size={13} strokeWidth={3} />}
                  <span>{c}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Outfit Size Selector */}
      <div>
        <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-neutral-700">
          <span className="flex items-center gap-1.5 text-neutral-900 font-extrabold">
            <Layers size={15} className="text-blue-600" />
            <span>Taille</span>
          </span>
          {selected?.size && <span className="font-extrabold text-blue-600 uppercase">{selected.size}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          {sizesForColor.map((v) => {
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
                className={`h-11 min-w-[3.2rem] px-3.5 rounded-xl text-xs sm:text-sm font-bold uppercase transition-all duration-150 flex items-center justify-center ${
                  sold
                    ? 'cursor-not-allowed bg-neutral-100 text-neutral-400 line-through border border-neutral-200'
                    : isSelected
                    ? 'bg-blue-600 hover:bg-blue-700 text-white font-black shadow-sm ring-2 ring-blue-100'
                    : 'bg-white hover:bg-neutral-50 text-neutral-800 border border-neutral-200/90 shadow-2xs cursor-pointer'
                }`}
              >
                {sold ? `${v.size} · Épuisé` : v.size}
              </button>
            );
          })}
        </div>
        {sizesForColor.some((v) => stockEnabled && v.available <= 0) && (
          <p className="mt-1.5 text-[11px] text-neutral-400 font-medium">
            Les tailles barrées sont momentanément indisponibles.
          </p>
        )}
      </div>
    </div>
  );
}
