'use client';

import { useRef, useState } from 'react';
import { AlertCircle, Check, ChevronLeft, ChevronRight, GripVertical, ImagePlus, Loader2, RefreshCw, Star, Trash2, Upload } from 'lucide-react';
import { MAX_PRODUCT_IMAGES, ProductMediaItem } from '@/lib/product-media';

type Props = {
  items: ProductMediaItem[];
  onAddFiles: (files: File[]) => string[];
  onRemove: (clientId: string) => void;
  onRetry: (clientId: string) => void;
  onReorder: (clientIds: string[]) => void;
  onSetPrimary: (clientId: string) => void;
};

export default function ProductImageManager({ items, onAddFiles, onRemove, onRetry, onReorder, onSetPrimary }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  function add(files: FileList | File[]) {
    const nextErrors = onAddFiles(Array.from(files));
    setErrors(nextErrors);
    if (inputRef.current) inputRef.current.value = '';
  }

  function move(clientId: string, offset: number) {
    const ids = items.map((item) => item.clientId);
    const from = ids.indexOf(clientId);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    onReorder(ids);
  }

  function drop(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    const ids = items.map((item) => item.clientId);
    const from = ids.indexOf(draggedId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const [id] = ids.splice(from, 1);
    ids.splice(to, 0, id);
    onReorder(ids);
  }

  return (
    <section aria-labelledby="product-images-title" className="mb-6 rounded-2xl border border-ink-200 bg-ink-100/60 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 id="product-images-title" className="flex items-center gap-2 text-sm font-black text-ink-900">
            <ImagePlus size={18} className="text-brand-500" /> Images du produit
          </h4>
          <p className="mt-1 text-xs leading-5 text-ink-700">JPEG, PNG ou WEBP · 8 Mo max · glissez pour réordonner.</p>
        </div>
        <span className="rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-black tabular-nums text-ink-700">
          {items.length} / {MAX_PRODUCT_IMAGES}
        </span>
      </div>

      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(event) => event.target.files && add(event.target.files)} />
      <button
        type="button"
        disabled={items.length >= MAX_PRODUCT_IMAGES}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => { event.preventDefault(); setDragOverId('dropzone'); }}
        onDragLeave={() => setDragOverId(null)}
        onDrop={(event) => { event.preventDefault(); setDragOverId(null); add(event.dataTransfer.files); }}
        className={`mb-4 flex min-h-28 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-5 py-4 text-center transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${dragOverId === 'dropzone' ? 'border-brand-500 bg-brand-50' : 'border-ink-200 bg-white hover:border-brand-300 hover:bg-brand-50/50'}`}
      >
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600"><Upload size={20} /></span>
        <span className="text-sm font-black text-ink-900">Ajouter des images</span>
        <span className="text-xs text-ink-700">Déposez plusieurs fichiers ici ou cliquez pour parcourir</span>
      </button>

      {errors.length > 0 && (
        <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {errors.map((error) => <p key={error}>{error}</p>)}
        </div>
      )}

      {items.length === 0 ? (
        <p className="rounded-xl border border-ink-200 bg-white px-4 py-5 text-center text-sm text-ink-700">Aucune image. La première image ajoutée deviendra l’image principale.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-live="polite">
          {items.map((item, index) => {
            const source = item.url || item.previewUrl || '';
            const busy = item.status === 'selected' || item.status === 'uploading';
            return (
              <article
                key={item.clientId}
                draggable={!busy}
                onDragStart={() => setDraggedId(item.clientId)}
                onDragOver={(event) => { event.preventDefault(); setDragOverId(item.clientId); }}
                onDragLeave={() => setDragOverId(null)}
                onDrop={(event) => { event.preventDefault(); drop(item.clientId); setDraggedId(null); setDragOverId(null); }}
                onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}
                className={`group overflow-hidden rounded-xl border bg-white shadow-sm transition duration-200 ${draggedId === item.clientId ? 'opacity-50' : ''} ${dragOverId === item.clientId ? 'border-brand-500 ring-2 ring-brand-200' : 'border-ink-200'}`}
              >
                <div className="relative aspect-square overflow-hidden bg-ink-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={source} alt={`Image produit ${index + 1}${item.isPrimary ? ', principale' : ''}`} className="h-full w-full object-cover" />
                  <span className="absolute left-2 top-2 grid h-8 w-8 place-items-center rounded-lg bg-white/95 text-ink-700 shadow-sm" aria-hidden><GripVertical size={16} /></span>
                  {item.isPrimary && <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-white"><Star size={11} fill="currentColor" /> Image principale</span>}
                  {busy && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/55 text-xs font-bold text-white"><Loader2 size={22} className="animate-spin" /><span>Téléversement…</span></div>}
                  {item.status === 'uploaded' && <span className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg bg-emerald-600 text-white" title="Téléversée"><Check size={16} /></span>}
                  {item.status === 'failed' && <div className="absolute inset-x-2 bottom-2 rounded-lg bg-red-600 px-2 py-1.5 text-[11px] font-bold text-white"><AlertCircle size={13} className="mr-1 inline" />{item.error ?? 'Échec du téléversement'}</div>}
                </div>
                <div className="space-y-2 p-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => move(item.clientId, -1)} disabled={index === 0 || busy} aria-label="Déplacer l’image vers la gauche" className="grid min-h-10 place-items-center rounded-lg border border-ink-200 text-ink-700 hover:bg-ink-100 disabled:opacity-35"><ChevronLeft size={16} /></button>
                    <button type="button" onClick={() => move(item.clientId, 1)} disabled={index === items.length - 1 || busy} aria-label="Déplacer l’image vers la droite" className="grid min-h-10 place-items-center rounded-lg border border-ink-200 text-ink-700 hover:bg-ink-100 disabled:opacity-35"><ChevronRight size={16} /></button>
                  </div>
                  {!item.isPrimary && !busy && item.status !== 'failed' && <button type="button" onClick={() => onSetPrimary(item.clientId)} className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2 text-[11px] font-black text-brand-700 hover:bg-brand-100"><Star size={14} /> Définir principale</button>}
                  {item.status === 'failed' && <button type="button" onClick={() => onRetry(item.clientId)} className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-amber-100 px-2 text-xs font-black text-amber-800 hover:bg-amber-200"><RefreshCw size={14} /> Réessayer</button>}
                  <button type="button" onClick={() => onRemove(item.clientId)} className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-bold text-red-600 hover:bg-red-50"><Trash2 size={14} /> Retirer</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
