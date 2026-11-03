'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  X,
  Maximize2,
  ArrowLeft,
  MoreHorizontal,
  Heart,
  Share2,
} from 'lucide-react';

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
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [isWishlisted, setIsWishlisted] = useState(false);

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

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.targetTouches[0].clientX);
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    if (Math.abs(diff) > 45) {
      if (diff > 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
    setTouchStartX(null);
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.share) {
      navigator.share({ title: productName, url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(window.location.href);
    }
  };

  return (
    <div className="relative w-full">
      {/* Container: Vertical Thumbnails on Left (Desktop) + Hero Image Canvas on Right */}
      <div className="flex flex-col md:flex-row gap-3 lg:gap-4 items-start">
        {/* Desktop Vertical Thumbnail Rail (Exactly as in Photo 2) */}
        {images.length > 1 && (
          <div className="hidden md:flex flex-col gap-2.5 w-20 shrink-0 max-h-[560px] overflow-y-auto scrollbar-none py-0.5">
            {images.map((img, idx) => {
              const isActive = idx === activeIdx;
              return (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setActiveIdx(idx)}
                  aria-label={`Image ${idx + 1}`}
                  className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-neutral-100 border-2 transition-all duration-150 cursor-pointer flex items-center justify-center ${
                    isActive
                      ? 'border-blue-600 ring-2 ring-blue-100 shadow-sm'
                      : 'border-neutral-200/80 hover:border-neutral-300 opacity-80 hover:opacity-100'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={img.alt || productName}
                    className="h-full w-full object-contain p-1"
                    loading="lazy"
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* Main Hero Image Canvas */}
        <div
          className="group relative flex-1 w-full aspect-[4/5] sm:aspect-[3/4] max-h-[62vh] sm:max-h-[70vh] md:max-h-[560px] overflow-hidden rounded-2xl sm:rounded-3xl bg-[#EEF0ED] border border-neutral-200/70 cursor-zoom-in shadow-xs transition-shadow duration-300 flex items-center justify-center select-none"
          onClick={() => setIsOpen(true)}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
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
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/85 backdrop-blur-md text-neutral-800 shadow-sm hover:bg-white active:scale-95 transition cursor-pointer"
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
                onClick={handleShare}
                aria-label="Partager"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/85 backdrop-blur-md text-neutral-800 shadow-sm hover:bg-white active:scale-95 transition cursor-pointer"
              >
                <MoreHorizontal size={18} />
              </button>
            </div>
          </div>

          {/* Desktop Discount Badge (Top-Left) */}
          {discount > 0 && (
            <span className="hidden md:inline-flex absolute left-4 top-4 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-black text-white shadow-sm z-10">
              -{discount}%
            </span>
          )}

          {/* Desktop Floating Action Buttons (Top-Right: Wishlist, Share, Fullscreen) */}
          <div className="hidden md:flex flex-col gap-2.5 absolute top-4 right-4 z-20">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsWishlisted(!isWishlisted);
              }}
              aria-label="Ajouter aux favoris"
              className={`flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm transition hover:scale-105 active:scale-95 cursor-pointer ${
                isWishlisted ? 'text-red-500' : 'text-neutral-700 hover:text-red-500'
              }`}
            >
              <Heart size={18} fill={isWishlisted ? 'currentColor' : 'none'} />
            </button>
            <button
              type="button"
              onClick={handleShare}
              aria-label="Partager"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm text-neutral-700 hover:text-blue-600 transition hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Share2 size={17} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(true);
              }}
              aria-label="Agrandir"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm text-neutral-700 hover:text-blue-600 transition hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Maximize2 size={16} />
            </button>
          </div>

          {/* Main Product Image — Uncropped, Standing Tall */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activeImage.url}
            alt={activeImage.alt || productName}
            className="h-full w-full object-contain p-2 sm:p-4 pb-14 sm:pb-16 md:pb-4 transition-transform duration-500 ease-out group-hover:scale-[1.02]"
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
                className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 h-10 w-10 items-center justify-center rounded-full bg-white/90 text-neutral-800 shadow-md backdrop-blur-xs transition hover:bg-white hover:scale-105 active:scale-95 opacity-0 group-hover:opacity-100 cursor-pointer"
              >
                <ChevronLeft size={22} />
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Image suivante"
                className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 h-10 w-10 items-center justify-center rounded-full bg-white/90 text-neutral-800 shadow-md backdrop-blur-xs transition hover:bg-white hover:scale-105 active:scale-95 opacity-0 group-hover:opacity-100 cursor-pointer"
              >
                <ChevronRight size={22} />
              </button>
            </>
          )}

          {/* Floating Thumbnail Cards on Mobile ONLY */}
          {images.length > 1 && (
            <div
              className="md:hidden absolute bottom-2.5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 p-1 rounded-xl bg-white/75 backdrop-blur-md shadow-sm border border-white/80 max-w-[90vw] overflow-x-auto scrollbar-none"
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
                    className={`relative h-11 w-9 sm:h-13 sm:w-11 shrink-0 overflow-hidden rounded-lg bg-white/90 border-2 transition-all duration-200 flex items-center justify-center cursor-pointer ${
                      isActive
                        ? 'border-blue-600 ring-2 ring-blue-100 shadow-sm scale-105'
                        : 'border-white/80 opacity-70 hover:opacity-100'
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
