import type { Metadata } from 'next';
import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import { categoryService } from '@/services';
import { SITE } from '@/lib/site-config';
import { getSiteSettings } from '@/lib/admin-storage';
import { getDictionary } from '@/lib/i18n';
import { getCurrentLang } from '@/lib/i18n-server';
import { Truck, Clock, ShieldCheck, RefreshCw, MapPin, Phone, MessageCircle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Politique de Livraison & Retours — Toute la Tunisie',
  description: 'Découvrez nos modalités de livraison rapide 24-48h sur toute la Tunisie, paiement à la livraison (COD) et conditions d’échange simples avec Boutique Ahmed Mzali.',
  alternates: {
    canonical: 'https://ahmedmzaliboutique.tn/livraison',
  },
  openGraph: {
    type: 'website',
    url: 'https://ahmedmzaliboutique.tn/livraison',
    title: 'Livraison & Retours — Boutique Ahmed Mzali',
    description: 'Livraison express 24-48h dans les 24 gouvernorats de Tunisie. Paiement à la livraison et échanges faciles.',
    images: [
      {
        url: 'https://ahmedmzaliboutique.tn/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Livraison Boutique Ahmed Mzali',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Livraison & Retours — Boutique Ahmed Mzali',
    description: 'Livraison 24-48h partout en Tunisie, paiement à la livraison.',
    images: ['https://ahmedmzaliboutique.tn/og-image.jpg'],
  },
};

export default async function LivraisonPage() {
  const lang = await getCurrentLang();
  const t = getDictionary(lang);
  const saved = await getSiteSettings();
  const categories = await categoryService.list({ hideEmpty: true }).catch(() => []);
  const phone = saved.phones?.[0] ?? SITE.contact.phone;
  const whatsapp = saved.whatsapp ?? SITE.contact.whatsapp;

  return (
    <>
      <Header categories={categories.map((c) => ({ name: c.name, slug: c.slug }))} />

      <main className="container-shop py-10 lg:py-16">
        <div className="mx-auto max-w-4xl">
          <header className="mb-12 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-600 mb-3">
              <Truck size={14} /> Service logistique national
            </span>
            <h1 className="text-3xl font-black uppercase tracking-tight text-ink-900 md:text-4xl">
              {t.trustPages.deliveryTitle}
            </h1>
            <p className="mt-3 text-base text-ink-700 max-w-2xl mx-auto">
              Expédition rapide et sécurisée dans tous les gouvernorats de Tunisie, avec paiement à la réception et suivi direct de votre colis.
            </p>
          </header>

          {/* 3 Key Pillars */}
          <div className="grid gap-6 sm:grid-cols-3 mb-12">
            <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-card text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand-500 mb-4">
                <Clock size={24} />
              </div>
              <h3 className="font-bold text-ink-900">Délai 24 – 48h</h3>
              <p className="mt-1 text-xs text-ink-600">Expédition rapide dès la confirmation téléphonique de votre commande.</p>
            </div>

            <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-card text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-cta mb-4">
                <ShieldCheck size={24} />
              </div>
              <h3 className="font-bold text-ink-900">Paiement à la livraison</h3>
              <p className="mt-1 text-xs text-ink-600">Réglez directement en espèces au livreur lors de la remise de votre colis.</p>
            </div>

            <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-card text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-blue-50 text-blue-600 mb-4">
                <RefreshCw size={24} />
              </div>
              <h3 className="font-bold text-ink-900">Échange facile</h3>
              <p className="mt-1 text-xs text-ink-600">Assistance réactive pour tout changement de taille ou modèle sous 48h.</p>
            </div>
          </div>

          {/* Detailed sections */}
          <div className="space-y-8">
            <section className="rounded-2xl border border-ink-100 bg-white p-6 md:p-8 shadow-card">
              <h2 className="text-xl font-black text-ink-900 flex items-center gap-2">
                <MapPin size={20} className="text-brand-500" /> Zones et Couverture de Livraison
              </h2>
              <p className="mt-3 text-sm text-ink-700 leading-relaxed">
                Nous assurons la livraison à domicile et sur votre lieu de travail sur <strong>l’ensemble du territoire tunisien</strong> :
              </p>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs font-semibold text-ink-700 bg-ink-50 p-4 rounded-xl">
                {SITE.cities.map((city) => (
                  <span key={city} className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> {city}
                  </span>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-ink-100 bg-white p-6 md:p-8 shadow-card">
              <h2 className="text-xl font-black text-ink-900 flex items-center gap-2">
                <Truck size={20} className="text-brand-500" /> Déroulement de la livraison
              </h2>
              <ol className="mt-4 space-y-3 text-sm text-ink-700 list-decimal list-inside leading-relaxed">
                <li><strong>Validation de la commande :</strong> Dès passation de votre commande sur le site, notre équipe vous appelle pour valider les tailles et coordonnées.</li>
                <li><strong>Expédition :</strong> Le colis est remis à notre transporteur express agréé.</li>
                <li><strong>Prise de rendez-vous :</strong> Le livreur vous contacte par téléphone avant son passage pour convenir de l’horaire exact.</li>
                <li><strong>Réception et règlement :</strong> Vous recevez votre colis et effectuez le paiement en toute sérénité.</li>
              </ol>
            </section>

            <section className="rounded-2xl border border-ink-100 bg-white p-6 md:p-8 shadow-card">
              <h2 className="text-xl font-black text-ink-900 flex items-center gap-2">
                <RefreshCw size={20} className="text-brand-500" /> Procédure d’échange et de retour
              </h2>
              <p className="mt-3 text-sm text-ink-700 leading-relaxed">
                Si la taille reçue ne convient pas ou si l’article présente un défaut :
              </p>
              <ul className="mt-3 space-y-2 text-sm text-ink-700 list-disc list-inside leading-relaxed">
                <li>Contactez notre service client sous 48 heures via WhatsApp au <strong>+216 {whatsapp}</strong> ou par téléphone au <strong>+216 {phone}</strong>.</li>
                <li>Indiquez votre nom et le nouveau modèle ou la nouvelle taille souhaitée.</li>
                <li>Notre livreur effectuera un échange direct lors de son prochain passage.</li>
              </ul>
            </section>

            {/* Assistance banner */}
            <div className="rounded-2xl bg-brand-700 p-8 text-white flex flex-col sm:flex-row items-center justify-between gap-6">
              <div>
                <h3 className="text-xl font-black">Besoin d’un suivi sur votre colis ?</h3>
                <p className="mt-1 text-sm text-white/80">Notre équipe logistique est disponible pour répondre à vos questions.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <a
                  href={`tel:${phone}`}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-ink-900 transition hover:bg-ink-100"
                >
                  <Phone size={16} /> +216 {phone}
                </a>
                <a
                  href={`https://wa.me/216${whatsapp}?text=${encodeURIComponent('Bonjour, je souhaite suivre ma livraison.')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#1EBE5D]"
                >
                  <MessageCircle size={16} /> WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
