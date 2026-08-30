import type { Metadata } from 'next';
import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import { categoryService } from '@/services';
import { SITE } from '@/lib/site-config';
import { getDictionary } from '@/lib/i18n';
import { getCurrentLang } from '@/lib/i18n-server';
import { Lock, Shield, EyeOff, UserCheck, Mail } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Politique de Confidentialité & Protection des Données',
  description: 'Politique de confidentialité de Boutique Ahmed Mzali. Vos données personnelles sont strictement protégées et utilisées uniquement pour vos commandes.',
  alternates: {
    canonical: 'https://ahmedmzaliboutique.tn/politique-confidentialite',
  },
  openGraph: {
    type: 'website',
    url: 'https://ahmedmzaliboutique.tn/politique-confidentialite',
    title: 'Politique de Confidentialité — Boutique Ahmed Mzali',
    description: 'Protection de la vie privée et respect des données personnelles sur https://ahmedmzaliboutique.tn.',
    images: [
      {
        url: 'https://ahmedmzaliboutique.tn/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Politique de Confidentialité Boutique Ahmed Mzali',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Politique de Confidentialité — Boutique Ahmed Mzali',
    description: 'Protection de la vie privée et respect des données personnelles sur Boutique Ahmed Mzali.',
    images: ['https://ahmedmzaliboutique.tn/og-image.jpg'],
  },
};

export default async function PolitiqueConfidentialitePage() {
  const lang = await getCurrentLang();
  const t = getDictionary(lang);
  const categories = await categoryService.list({ hideEmpty: true }).catch(() => []);
  const email = SITE.contact.email;

  return (
    <>
      <Header categories={categories.map((c) => ({ name: c.name, slug: c.slug }))} />

      <main className="container-shop py-10 lg:py-16">
        <div className="mx-auto max-w-3xl">
          <header className="mb-10">
            <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-600 mb-3">
              <Lock size={14} /> Protection de la vie privée
            </div>
            <h1 className="text-3xl font-black text-ink-900 md:text-4xl">
              {t.trustPages.privacyTitle}
            </h1>
            <p className="mt-2 text-sm text-ink-500">
              Dernière mise à jour : {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
            </p>
          </header>

          <article className="prose prose-slate max-w-none space-y-8 text-ink-800">
            <section className="rounded-2xl border border-ink-100 bg-white p-6 md:p-8 shadow-card">
              <h2 className="text-xl font-black text-ink-900 flex items-center gap-2">
                <Shield size={20} className="text-brand-500" /> 1. Engagement de confidentialité
              </h2>
              <p className="mt-3 text-sm text-ink-700 leading-relaxed">
                <strong>Boutique Ahmed Mzali</strong> accorde une importance capitale à la protection de la vie privée et des données personnelles de ses clients et visiteurs sur le site <strong>https://ahmedmzaliboutique.tn</strong>. Nous nous engageons à collecter et traiter vos données dans la plus stricte transparence et conformément aux meilleures pratiques de sécurité informatique.
              </p>
            </section>

            <section className="rounded-2xl border border-ink-100 bg-white p-6 md:p-8 shadow-card">
              <h2 className="text-xl font-black text-ink-900 flex items-center gap-2">
                <UserCheck size={20} className="text-brand-500" /> 2. Données collectées et Finalités
              </h2>
              <p className="mt-3 text-sm text-ink-700 leading-relaxed">
                Lors de votre navigation et de la passation de commande, nous collectons exclusivement les informations nécessaires au bon déroulement du service :
              </p>
              <ul className="mt-3 space-y-1.5 text-sm text-ink-700 list-disc list-inside">
                <li><strong>Nom et prénom :</strong> Pour identifier le destinataire du colis.</li>
                <li><strong>Numéro de téléphone :</strong> Pour la confirmation téléphonique et la prise de rendez-vous avec le livreur.</li>
                <li><strong>Adresse de livraison et ville :</strong> Pour l’acheminement précis du colis.</li>
                <li><strong>Adresse email (optionnelle) :</strong> Pour l’envoi de récapitulatifs de commande.</li>
              </ul>
            </section>

            <section className="rounded-2xl border border-ink-100 bg-white p-6 md:p-8 shadow-card">
              <h2 className="text-xl font-black text-ink-900 flex items-center gap-2">
                <EyeOff size={20} className="text-brand-500" /> 3. Non-divulgation et Partage restreint
              </h2>
              <p className="mt-3 text-sm text-ink-700 leading-relaxed">
                Vos données personnelles ne sont <strong>jamais vendues, louées ou cédées</strong> à des tiers à des fins commerciales ou publicitaires. Elles sont transmises uniquement à nos transporteurs agréés dans le cadre exclusif de la livraison de votre colis.
              </p>
            </section>

            <section className="rounded-2xl border border-ink-100 bg-white p-6 md:p-8 shadow-card">
              <h2 className="text-xl font-black text-ink-900 flex items-center gap-2">
                <Lock size={20} className="text-brand-500" /> 4. Sécurité des Données
              </h2>
              <p className="mt-3 text-sm text-ink-700 leading-relaxed">
                L’ensemble des échanges avec notre site internet est sécurisé par un protocole de chiffrement moderne <strong>HTTPS / TLS</strong>. Notre infrastructure technique est hébergée sur des serveurs sécurisés bénéficiant de protections avancées contre les accès non autorisés.
              </p>
            </section>

            <section className="rounded-2xl border border-ink-100 bg-white p-6 md:p-8 shadow-card">
              <h2 className="text-xl font-black text-ink-900 flex items-center gap-2">
                <Mail size={20} className="text-brand-500" /> 5. Vos Droits
              </h2>
              <p className="mt-3 text-sm text-ink-700 leading-relaxed">
                Conformément à la législation en vigueur relative à la protection des données personnelles, vous disposez d’un droit d’accès, de rectification et de suppression de vos données personnelles. Vous pouvez exercer ce droit à tout moment en nous écrivant à : <strong>{email}</strong>.
              </p>
            </section>
          </article>
        </div>
      </main>

      <Footer />
    </>
  );
}
