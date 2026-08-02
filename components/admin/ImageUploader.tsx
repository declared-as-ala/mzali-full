'use client';
import { useRef, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { useToast } from './Toast';

type UploadedImage = { id: string; url: string };

type Props = {
  onUploaded: (img: UploadedImage) => void;
  multiple?: boolean;
  /** Custom trigger content (overrides the default 800×800 dashed slot). */
  children?: React.ReactNode;
  className?: string;
  accept?: string;
};

export default function ImageUploader({ onUploaded, multiple = false, children, className = '', accept = 'image/*' }: Props) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function uploadOne(file: File): Promise<UploadedImage | null> {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.id || !data?.url) {
      toast.error(`Échec (${file.name}) : ${data?.error ?? 'upload'}`);
      return null;
    }
    return { id: String(data.id), url: data.url };
  }

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const list = multiple ? Array.from(files) : Array.from(files).slice(0, 1);
    setBusy(true);
    try {
      // Uploaded in parallel so selecting/dropping many photos at once doesn't
      // wait on each one sequentially before the next starts.
      const results = await Promise.all(list.map((file) => uploadOne(file)));
      const ok = results.filter((r): r is UploadedImage => r !== null);
      for (const r of ok) onUploaded(r);
      if (ok.length) toast.success(ok.length > 1 ? `${ok.length} images téléversées` : 'Image téléversée');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        disabled={busy}
        className={`${className || 'grid aspect-square place-items-center rounded-xl border-2 border-dashed border-ink-200 bg-ink-100 text-xs font-bold text-ink-700 transition hover:border-brand-300 hover:bg-ink-200 disabled:opacity-60'} ${dragOver ? '!border-brand-500 !bg-brand-50 ring-2 ring-brand-300' : ''}`}
        aria-label="Téléverser une ou plusieurs images"
      >
        {children ?? (
          busy ? (
            <span className="flex flex-col items-center gap-1">
              <Loader2 size={18} className="animate-spin text-brand-500" />
              <span>Téléversement…</span>
            </span>
          ) : (
            <span className="flex flex-col items-center gap-1">
              <Upload size={18} className="text-brand-500" />
              <span>{multiple ? 'Glissez ou choisissez plusieurs photos' : '800 × 800'}</span>
            </span>
          )
        )}
      </button>
    </>
  );
}
