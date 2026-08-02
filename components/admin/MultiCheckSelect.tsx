'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';

type Item = { id: string; name: string };

type Props = {
  items: Item[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  className?: string;
};

export default function MultiCheckSelect({ items, selected, onChange, placeholder = 'Sélectionner…', className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  function remove(id: string) { onChange(selected.filter((x) => x !== id)); }

  const filtered = items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()));
  const selectedItems = selected.map((id) => items.find((i) => i.id === id)).filter(Boolean) as Item[];

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full min-h-[42px] items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 py-1.5 text-left text-sm hover:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      >
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {selectedItems.length === 0 && <span className="text-ink-700">{placeholder}</span>}
          {selectedItems.map((it) => (
            <span key={it.id} className="inline-flex items-center gap-1 rounded-md bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-700">
              {it.name}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(it.id); }}
                className="rounded-sm hover:bg-brand-200"
                aria-label={`Retirer ${it.name}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <ChevronDown size={16} className={`text-ink-700 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-ink-200 bg-white shadow-xl">
          <div className="border-b border-ink-200 p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher…"
              className="w-full rounded-lg border border-ink-200 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
          <ul className="max-h-60 overflow-y-auto">
            {filtered.length === 0 && <li className="p-3 text-xs text-ink-700">Aucun résultat.</li>}
            {filtered.map((i) => {
              const isOn = selected.includes(i.id);
              return (
                <li key={i.id}>
                  <button
                    type="button"
                    onClick={() => toggle(i.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-brand-50"
                  >
                    <span className={`grid h-4 w-4 place-items-center rounded border ${isOn ? 'border-brand-500 bg-brand-500 text-white' : 'border-ink-200'}`}>
                      {isOn && <Check size={11} />}
                    </span>
                    <span className="flex-1 font-medium">{i.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
