'use client';

import { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';

interface ImageItem {
  id: string | number;
  url: string;
  alt?: string;
}

interface ProductGalleryProps {
  images: ImageItem[];
  productName: string;
  discount: number;
}

export default function ProductGallery({ images, productName, discount }: ProductGalleryProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  if (!images || images.length === 0) return null;

  const activeImage = images[activeIdx] || images[0];

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIdx((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIdx((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  return (
    <div>
      {/* Main Image */}
      <div 
        className="group relative w-full overflow-hidden rounded-2xl bg-ink-100 cursor-zoom-in shadow-sm hover:shadow-md transition-shadow duration-300"
        onClick={() => setIsOpen(true)}
      >
        <div style={{ paddingBottom: '100%' }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={activeImage.url}
          alt={activeImage.alt || productName}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          loading="eager"
        />
        {discount > 0 && (
          <span className="absolute left-3 top-3 rounded-md bg-red-600 px-2.5 py-1 text-xs font-black text-white shadow z-10">
            -{discount}%
          </span>
        )}
        
        {/* Zoom Icon overlay */}
        <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
          <div className="bg-white/90 text-ink-900 rounded-full p-3 shadow-lg transform scale-90 group-hover:scale-100 transition-transform duration-300">
            <Maximize2 size={20} className="text-ink-700" />
          </div>
        </div>
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {images.map((img, idx) => {
            const isActive = idx === activeIdx;
            return (
              <button
                key={img.id}
                type="button"
                onClick={() => setActiveIdx(idx)}
                className={`relative w-16 h-16 sm:w-20 sm:h-20 overflow-hidden rounded-xl bg-ink-100 transition duration-200 outline-none ${
                  isActive 
                    ? 'ring-2 ring-brand-500 opacity-100 scale-95' 
                    : 'opacity-70 hover:opacity-100 hover:scale-95'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.alt || productName}
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                />
              </button>
            );
          })}
        </div>
      )}

      {/* Lightbox Modal */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 backdrop-blur-sm transition-all duration-300"
          onClick={() => setIsOpen(false)}
        >
          {/* Close Button */}
          <button 
            className="absolute top-4 right-4 z-50 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 transition cursor-pointer"
            onClick={() => setIsOpen(false)}
            aria-label="Close lightbox"
          >
            <X size={24} />
          </button>

          {/* Navigation - Prev */}
          {images.length > 1 && (
            <button 
              className="absolute left-4 top-1/2 -translate-y-1/2 z-50 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 transition cursor-pointer"
              onClick={handlePrev}
              aria-label="Previous image"
            >
              <ChevronLeft size={28} />
            </button>
          )}

          {/* Large Image Container */}
          <div 
            className="relative max-h-[85vh] max-w-[90vw] overflow-hidden rounded-xl"
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking the image
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={activeImage.url}
              alt={activeImage.alt || productName}
              className="max-h-[85vh] max-w-[90vw] object-contain transition-transform duration-300"
            />
            {discount > 0 && (
              <span className="absolute left-4 top-4 rounded-md bg-red-600 px-3 py-1.5 text-sm font-black text-white shadow">
                -{discount}%
              </span>
            )}
          </div>

          {/* Navigation - Next */}
          {images.length > 1 && (
            <button 
              className="absolute right-4 top-1/2 -translate-y-1/2 z-50 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 transition cursor-pointer"
              onClick={handleNext}
              aria-label="Next image"
            >
              <ChevronRight size={28} />
            </button>
          )}

          {/* Image indicator count */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm font-semibold tracking-wider">
            {activeIdx + 1} / {images.length}
          </div>
        </div>
      )}
    </div>
  );
}
