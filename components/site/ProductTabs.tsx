'use client';

import { useState } from 'react';
import { Check, Truck, MessageSquare, RotateCcw } from 'lucide-react';

interface ProductTabsProps {
  description?: string;
  shortDescription?: string;
}

export default function ProductTabs({ description, shortDescription }: ProductTabsProps) {
  const [tab, setTab] = useState<'desc' | 'shipping' | 'reviews'>('desc');

  return (
    <div className="mt-8 border-t border-neutral-200/80 pt-6">
      {/* Tabs Header */}
      <div className="flex items-center gap-6 border-b border-neutral-200/80 pb-2.5 text-xs sm:text-sm md:text-base">
        <button
          type="button"
          onClick={() => setTab('desc')}
          className={`cursor-pointer transition-colors relative pb-2.5 font-bold ${
            tab === 'desc'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          Description
        </button>
        <button
          type="button"
          onClick={() => setTab('shipping')}
          className={`cursor-pointer transition-colors relative pb-2.5 font-bold ${
            tab === 'shipping'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          Livraison &amp; Retours
        </button>
        <button
          type="button"
          onClick={() => setTab('reviews')}
          className={`cursor-pointer transition-colors relative pb-2.5 font-bold ${
            tab === 'reviews'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          Avis clients (0)
        </button>
      </div>

      {/* Tabs Content */}
      <div className="pt-4 text-xs sm:text-sm text-neutral-600 leading-relaxed">
        {tab === 'desc' && (
          <div className="space-y-4">
            {description ? (
              <div
                className="prose prose-sm max-w-none text-neutral-600"
                dangerouslySetInnerHTML={{ __html: description }}
              />
            ) : shortDescription ? (
              <div
                className="prose prose-sm max-w-none text-neutral-600"
                dangerouslySetInnerHTML={{ __html: shortDescription }}
              />
            ) : (
              <p>
                Produit confortable et tendance, idéal pour un look décontracté au quotidien. Matière douce, coupe
                moderne et finitions soignées.
              </p>
            )}

            {/* Feature Bullets (Photo 2) */}
            <ul className="space-y-2 pt-2 text-neutral-700 font-medium">
              <li className="flex items-center gap-2">
                <Check size={16} className="text-blue-600 shrink-0" strokeWidth={2.5} />
                <span>Matière douce et chaude</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={16} className="text-blue-600 shrink-0" strokeWidth={2.5} />
                <span>Coupe confortable</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={16} className="text-blue-600 shrink-0" strokeWidth={2.5} />
                <span>Style moderne et décontracté</span>
              </li>
            </ul>
          </div>
        )}

        {tab === 'shipping' && (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Truck size={18} className="text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-neutral-900">Livraison rapide 24h-48h</p>
                <p className="text-neutral-500">
                  Expédition express partout en Tunisie. Paiement à la livraison (COD) sans engagement.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <RotateCcw size={18} className="text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-neutral-900">Échange facile sous 7 jours</p>
                <p className="text-neutral-500">
                  La taille ne convient pas ? Vous disposez de 7 jours pour demander un échange rapide.
                </p>
              </div>
            </div>
          </div>
        )}

        {tab === 'reviews' && (
          <div className="py-4 text-center text-neutral-500">
            <MessageSquare size={24} className="mx-auto text-neutral-300 mb-2" />
            <p className="font-semibold">Aucun avis pour le moment.</p>
            <p className="text-xs text-neutral-400 mt-1">
              Soyez le premier à donner votre avis après réception de votre commande !
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
