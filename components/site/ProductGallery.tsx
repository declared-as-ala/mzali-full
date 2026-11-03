'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, X, Maximize2, ArrowLeft, MoreHorizontal } from 'lucide-react';

interface ImageItem {
  id: string | number;
  url: string;
  alt?: string;
  isPrimary?: boolean;
}

interface ProductGalleryProps {
  images: ImageItem[];
  productName: string;
  discount: number;
}

export default function ProductGallery({ images, productName, discount }: ProductGalleryProps) {
  const router = useRouter();
  const [activeIdx, setActiveIdx] = useState(() => Math.max(0, images.findIndex((image) => image.isPrimary)));
  const [isOpen, setIsOpen] = useState(false);

  if (!images || images.length === 0) return null;

  const activeImage = images[activeIdx] || images[0];

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActiveIdx((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActiveIdx((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  return (
    <div className="relative w-full">
      {/* Editorial Luxury Hero Canvas */}
      <div
        className="group relative w-full h-[54vh] min-h-[380px] sm:h-[62vh] sm:min-h-[460px] md:h-auto md:aspect-[3/4] overflow-hidden rounded-2xl sm:rounded-3xl bg-[#EEF0ED] border border-neutral-200/60 cursor-zoom-in shadow-xs transition-shadow duration-300 flex items-center justify-center select-none"
        onClick={() => setIsOpen(true)}
      >
        {/* Mobile floating Back Button & Actions */}
        <div className="absolute top-3.5 inset-x-3.5 z-20 flex items-center justify-between pointer-events-auto md:hidden">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              router.back();
            }}
            aria-label="Retour"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 backdrop-blur-md text-neutral-800 shadow-sm hover:bg-white active:scale-95 transition"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="flex items-center gap-2">
            {discount > 0 && (
              <span className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-black text-white shadow-sm">
                -{discount}%
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (navigator.share) {
                  navigator.share({ title: productName, url: window.location.href }).catch(() => {});
                }
              }}
              aria-label="Options"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 backdrop-blur-md text-neutral-800 shadow-sm hover:bg-white active:scale-95 transition"
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>

        {/* Desktop Discount Badge */}
        {discount > 0 && (
          <span className="hidden md:inline-flex absolute left-4 top-4 rounded-lg bg-red-600 px-2.5 py-1 text-xs font-black text-white shadow-sm z-10">
            -{discount}%
          </span>
        )}

        {/* Main Product Image — Uncropped, Standing Tall */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={activeImage.url}
          alt={activeImage.alt || productName}
          className="h-full w-full object-contain p-3 sm:p-5 pb-18 sm:pb-20 md:pb-5 transition-transform duration-500 ease-out group-hover:scale-[1.02]"
          loading="eager"
          decoding="async"
          fetchPriority="high"
        />

        {/* Desktop Arrow Controls */}
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Image précédente"
              className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 h-10 w-10 items-center justify-center rounded-full bg-white/90 text-neutral-800 shadow-md backdrop-blur-xs transition hover:bg-white hover:scale-105 active:scale-95 opacity-0 group-hover:opacity-100"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              onClick={handleNext}
              aria-label="Image suivante"
              className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 h-10 w-10 items-center justify-center rounded-full bg-white/90 text-neutral-800 shadow-md backdrop-blur-xs transition hover:bg-white hover:scale-105 active:scale-95 opacity-0 group-hover:opacity-100"
            >
              <ChevronRight size={22} />
            </button>
          </>
        )}

        {/* Floating Thumbnail Cards — Signature High-Fashion Mobile Layout */}
        {images.length > 1 && (
          <div
            className="absolute bottom-3.5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 sm:gap-2.5 p-1 rounded-2xl bg-white/50 backdrop-blur-md shadow-md border border-white/80 max-w-[92vw] overflow-x-auto scrollbar-none"
            onClick={(e) => e.stopPropagation()}
          >
            {images.map((img, idx) => {
              const isActive = idx === activeIdx;
              return (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setActiveIdx(idx)}
                  aria-label={`Image ${idx + 1}`}
                  className={`relative h-13 w-11 sm:h-15 sm:w-13 shrink-0 overflow-hidden rounded-xl bg-white/90 border-2 transition-all duration-200 flex items-center justify-center ${
                    isActive
                      ? 'border-neutral-900 ring-2 ring-neutral-900/10 shadow-md scale-105'
                      : 'border-white/80 opacity-75 hover:opacity-100'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={img.alt || productName}
                    className="h-full w-full object-contain p-0.5"
                    loading="lazy"
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* Desktop Zoom Icon */}
        <div className="hidden md:flex absolute top-4 right-4 z-10 h-8 w-8 items-center justify-center rounded-full bg-white/80 text-neutral-700 shadow-sm backdrop-blur-xs opacity-75 group-hover:opacity-100 transition-opacity">
          <Maximize2 size={15} />
        </div>
      </div>

      {/* Fullscreen Lightbox Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm transition-all duration-300 select-none"
          onClick={() => setIsOpen(false)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition cursor-pointer"
            onClick={() => setIsOpen(false)}
            aria-label="Fermer"
          >
            <X size={24} />
          </button>

          {images.length > 1 && (
            <button
              type="button"
              className="absolute left-4 top-1/2 -translate-y-1/2 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition cursor-pointer"
              onClick={handlePrev}
              aria-label="Précédent"
            >
              <ChevronLeft size={28} />
            </button>
          )}

          <div
            className="relative max-h-[85vh] max-w-[90vw] overflow-hidden rounded-2xl flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeImage.url}
              alt={activeImage.alt || productName}
              className="max-h-[85vh] max-w-[90vw] object-contain transition-transform duration-300"
            />
          </div>

          {images.length > 1 && (
            <button
              type="button"
              className="absolute right-4 top-1/2 -translate-y-1/2 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition cursor-pointer"
              onClick={handleNext}
              aria-label="Suivant"
            >
              <ChevronRight size={28} />
            </button>
          )}

          {images.length > 1 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-white/10 backdrop-blur-xs px-3.5 py-1 text-xs font-bold text-white">
              {activeIdx + 1} / {images.length}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
