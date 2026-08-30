import type { Metadata } from 'next';
import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import { categoryService } from '@/services';
import { SITE } from '@/lib/site-config';
import { getSiteSettings } from '@/lib/admin-storage';
import { getDictionary } from '@/lib/i18n';
import { getCurrentLang } from '@/lib/i18n-server';
import { Scale, Building2, Server, ShieldCheck, Mail, Phone } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Mentions Légales & Informations Éditeur',
  description: 'Consultez les mentions légales de Boutique Ahmed Mzali. Informations sur l’éditeur du site, l’hébergement et les droits de propriété intellectuelle.',
  alternates: {
    canonical: 'https://ahmedmzaliboutique.tn/mentions-legales',
  },
  openGraph: {
    type: 'website',
    url: 'https://ahmedmzaliboutique.tn/mentions-legales',
    title: 'Mentions Légales — Boutique Ahmed Mzali',
    description: 'Mentions légales, éditeur et hébergement de Boutique Ahmed Mzali (https://ahmedmzaliboutique.tn).',
    images: [
      {
        url: 'https://ahmedmzaliboutique.tn/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Mentions Légales Boutique Ahmed Mzali',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mentions Légales — Boutique Ahmed Mzali',
    description: 'Mentions légales et informations éditeur de Boutique Ahmed Mzali.',
    images: ['https://ahmedmzaliboutique.tn/og-image.jpg'],
  },
};

export default async function MentionsLegalesPage() {
  const lang = await getCurrentLang();
  const t = getDictionary(lang);
  const saved = await getSiteSettings();
  const categories = await categoryService.list({ hideEmpty: true }).catch(() => []);
  const phone = saved.phones?.[0] ?? SITE.contact.phone;
  const email = SITE.contact.email;

  return (
    <>
      <Header categories={categories.map((c) => ({ name: c.name, slug: c.slug }))} />

      <main className="container-shop py-10 lg:py-16">
        <div className="mx-auto max-w-3xl">
          <header className="mb-10">
            <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-600 mb-3">
              <Scale size={14} /> Transparence légale
            </div>
            <h1 className="text-3xl font-black text-ink-900 md:text-4xl">
              {t.trustPages.legalTitle}
            </h1>
            <p className="mt-2 text-sm text-ink-500">
              Dernière mise à jour : {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
            </p>
          </header>

          <article className="prose prose-slate max-w-none space-y-8 text-ink-800">
            <section className="rounded-2xl border border-ink-100 bg-white p-6 md:p-8 shadow-card">
              <h2 className="text-xl font-black text-ink-900 flex items-center gap-2">
                <Building2 size={20} className="text-brand-500" /> 1. Éditeur du site internet
              </h2>
              <div className="mt-4 space-y-2 text-sm text-ink-700 leading-relaxed">
                <p>Le site internet accessible à l’adresse <strong>https://ahmedmzaliboutique.tn</strong> est édité et exploité par :</p>
                <ul className="mt-2 space-y-1.5 list-disc list-inside bg-ink-50 p-4 rounded-xl">
                  <li><strong>Nom commercial :</strong> Boutique Ahmed Mzali</li>
                  <li><strong>Responsable de publication :</strong> Ahmed Mzali</li>
                  <li><strong>Activité :</strong> Vente au détail de vêtements, chaussures et accessoires</li>
                  <li><strong>Pays :</strong> Tunisie (Tunis)</li>
                  <li><strong>Téléphone :</strong> +216 {phone}</li>
                  <li><strong>Email de contact :</strong> {email}</li>
                </ul>
              </div>
            </section>

            <section className="rounded-2xl border border-ink-100 bg-white p-6 md:p-8 shadow-card">
              <h2 className="text-xl font-black text-ink-900 flex items-center gap-2">
                <Server size={20} className="text-brand-500" /> 2. Hébergement et Infrastructure technique
              </h2>
              <div className="mt-4 space-y-2 text-sm text-ink-700 leading-relaxed">
                <p>Le site est hébergé sur une infrastructure cloud sécurisée fournie par :</p>
                <ul className="mt-2 space-y-1.5 list-disc list-inside bg-ink-50 p-4 rounded-xl">
                  <li><strong>Hébergeur :</strong> OVHcloud SAS</li>
                  <li><strong>Adresse de l’hébergeur :</strong> 2 rue Kellermann - 59100 Roubaix - France</li>
                  <li><strong>Site web :</strong> www.ovhcloud.com</li>
                  <li><strong>Certificat de sécurité SSL/TLS :</strong> Émis et renouvelé via Caddy / Let’s Encrypt</li>
                </ul>
              </div>
            </section>

            <section className="rounded-2xl border border-ink-100 bg-white p-6 md:p-8 shadow-card">
              <h2 className="text-xl font-black text-ink-900 flex items-center gap-2">
                <ShieldCheck size={20} className="text-brand-500" /> 3. Propriété intellectuelle
              </h2>
              <p className="mt-3 text-sm text-ink-700 leading-relaxed">
                L’ensemble des contenus présents sur le site <strong>https://ahmedmzaliboutique.tn</strong> (textes, visuels, logos, photographies de produits, structure générale) est protégé par les dispositions relatives au droit de la propriété intellectuelle. Toute reproduction ou utilisation non autorisée est strictement interdite.
              </p>
            </section>

            <section className="rounded-2xl border border-ink-100 bg-white p-6 md:p-8 shadow-card">
              <h2 className="text-xl font-black text-ink-900 flex items-center gap-2">
                <Mail size={20} className="text-brand-500" /> 4. Contact et Réclamations
              </h2>
              <p className="mt-3 text-sm text-ink-700 leading-relaxed">
                Pour toute question ou réclamation relative au fonctionnement du site, vous pouvez joindre notre service client par téléphone au <strong>+216 {phone}</strong> ou par courrier électronique à l’adresse <strong>{email}</strong>.
              </p>
            </section>
          </article>
        </div>
      </main>

      <Footer />
    </>
  );
}
