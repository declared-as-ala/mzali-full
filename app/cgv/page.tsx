import type { Metadata } from 'next';
import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import { categoryService } from '@/services';
import { SITE } from '@/lib/site-config';
import { getSiteSettings } from '@/lib/admin-storage';
import { getDictionary } from '@/lib/i18n';
import { getCurrentLang } from '@/lib/i18n-server';
import { FileText, CheckCircle2, Shield, Truck, RefreshCw, HelpCircle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Conditions Générales de Vente (CGV)',
  description: 'Consultez les conditions générales de vente de Boutique Ahmed Mzali. Modalités de commande, livraison en Tunisie, paiement à la livraison et retours.',
  alternates: {
    canonical: 'https://ahmedmzaliboutique.tn/cgv',
  },
  openGraph: {
    type: 'website',
    url: 'https://ahmedmzaliboutique.tn/cgv',
    title: 'Conditions Générales de Vente (CGV) — Boutique Ahmed Mzali',
    description: 'Conditions de vente, commande, livraison COD et politique d’échange de Boutique Ahmed Mzali en Tunisie.',
    images: [
      {
        url: 'https://ahmedmzaliboutique.tn/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'CGV Boutique Ahmed Mzali',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CGV — Boutique Ahmed Mzali',
    description: 'Conditions générales de vente de Boutique Ahmed Mzali en Tunisie.',
    images: ['https://ahmedmzaliboutique.tn/og-image.jpg'],
  },
};

export default async function CGVPage() {
  const lang = await getCurrentLang();
  const t = getDictionary(lang);
  const saved = await getSiteSettings();
  const categories = await categoryService.list({ hideEmpty: true }).catch(() => []);
  const phone = saved.phones?.[0] ?? SITE.contact.phone;

  return (
    <>
      <Header categories={categories.map((c) => ({ name: c.name, slug: c.slug }))} />

      <main className="container-shop py-10 lg:py-16">
        <div className="mx-auto max-w-3xl">
          <header className="mb-10">
            <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-600 mb-3">
              <FileText size={14} /> Information légale & commerciale
            </div>
            <h1 className="text-3xl font-black text-ink-900 md:text-4xl">
              {t.trustPages.cgvTitle}
            </h1>
            <p className="mt-2 text-sm text-ink-500">
              Dernière mise à jour : {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
            </p>
          </header>

          <article className="prose prose-slate max-w-none space-y-8 text-ink-800">
            <section className="rounded-2xl border border-ink-100 bg-white p-6 md:p-8 shadow-card">
              <h2 className="text-xl font-black text-ink-900 flex items-center gap-2">
                <CheckCircle2 size={20} className="text-brand-500" /> 1. Objet et Champ d’application
              </h2>
              <p className="mt-3 text-sm text-ink-700 leading-relaxed">
                Les présentes Conditions Générales de Vente (CGV) régissent l’ensemble des ventes conclues sur le site internet <strong>https://ahmedmzaliboutique.tn</strong>, exploité sous l’enseigne <strong>Boutique Ahmed Mzali</strong>. Toute commande passée sur le site implique l’adhésion sans réserve de l’acheteur aux présentes conditions.
              </p>
            </section>

            <section className="rounded-2xl border border-ink-100 bg-white p-6 md:p-8 shadow-card">
              <h2 className="text-xl font-black text-ink-900 flex items-center gap-2">
                <Shield size={20} className="text-brand-500" /> 2. Produits et Tarifs
              </h2>
              <p className="mt-3 text-sm text-ink-700 leading-relaxed">
                Les articles proposés à la vente sont ceux décrits sur le site au moment de la consultation par le client. Les prix sont indiqués en Dinars Tunisiens (TND / DT) toutes taxes comprises, hors frais de livraison qui sont précisés lors de la validation du panier.
              </p>
            </section>

            <section className="rounded-2xl border border-ink-100 bg-white p-6 md:p-8 shadow-card">
              <h2 className="text-xl font-black text-ink-900 flex items-center gap-2">
                <FileText size={20} className="text-brand-500" /> 3. Commande et Confirmation
              </h2>
              <p className="mt-3 text-sm text-ink-700 leading-relaxed">
                Le client passe commande en sélectionnant les articles souhaités et en complétant ses coordonnées (nom, numéro de téléphone, adresse de livraison). Afin de garantir un service optimal et d’éviter toute erreur, nos équipes contactent systématiquement le client par téléphone ou message avant l’expédition pour valider la commande.
              </p>
            </section>

            <section className="rounded-2xl border border-ink-100 bg-white p-6 md:p-8 shadow-card">
              <h2 className="text-xl font-black text-ink-900 flex items-center gap-2">
                <Truck size={20} className="text-brand-500" /> 4. Paiement à la Livraison (Cash on Delivery)
              </h2>
              <p className="mt-3 text-sm text-ink-700 leading-relaxed">
                Pour assurer une sécurité et une confiance maximales, le règlement de la commande s’effectue en espèces directement auprès du livreur au moment de la réception du colis. Aucun paiement bancaire préalable n’est exigé en ligne.
              </p>
            </section>

            <section className="rounded-2xl border border-ink-100 bg-white p-6 md:p-8 shadow-card">
              <h2 className="text-xl font-black text-ink-900 flex items-center gap-2">
                <RefreshCw size={20} className="text-brand-500" /> 5. Livraison et Délais
              </h2>
              <p className="mt-3 text-sm text-ink-700 leading-relaxed">
                Les livraisons sont effectuées sur toute la Tunisie (24 gouvernorats) par des transporteurs partenaires agréés. Les délais indicatifs de livraison sont de <strong>24 à 48 heures ouvrables</strong> à compter de la confirmation téléphonique de la commande.
              </p>
            </section>

            <section className="rounded-2xl border border-ink-100 bg-white p-6 md:p-8 shadow-card">
              <h2 className="text-xl font-black text-ink-900 flex items-center gap-2">
                <HelpCircle size={20} className="text-brand-500" /> 6. Échanges et Service Client
              </h2>
              <p className="mt-3 text-sm text-ink-700 leading-relaxed">
                En cas de problème de taille ou de produit non conforme, le client dispose d’un délai de 48 heures à compter de la réception pour contacter notre service client au <strong>+216 {phone}</strong> afin d’organiser un échange. Les articles doivent être retournés neufs, non portés et dans leur emballage d’origine.
              </p>
            </section>
          </article>
        </div>
      </main>

      <Footer />
    </>
  );
}
