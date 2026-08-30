import type { Metadata } from 'next';
import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import { categoryService } from '@/services';
import { SITE } from '@/lib/site-config';
import { getSiteSettings } from '@/lib/admin-storage';
import { getDictionary } from '@/lib/i18n';
import { getCurrentLang } from '@/lib/i18n-server';
import { Phone, MessageCircle, Mail, MapPin, Clock, ShieldCheck, Send } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Contactez-nous — Service Client & Horaires',
  description: 'Besoin d’aide ou d’informations sur vos commandes ? Contactez Boutique Ahmed Mzali par téléphone, WhatsApp ou email. Livraison et service client partout en Tunisie.',
  alternates: {
    canonical: 'https://ahmedmzaliboutique.tn/contact',
  },
  openGraph: {
    type: 'website',
    url: 'https://ahmedmzaliboutique.tn/contact',
    title: 'Contactez-nous — Boutique Ahmed Mzali',
    description: 'Service client Boutique Ahmed Mzali. Joignable par téléphone, WhatsApp (+216 22 479 443) et email.',
    images: [
      {
        url: 'https://ahmedmzaliboutique.tn/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Contactez Boutique Ahmed Mzali',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contactez-nous — Boutique Ahmed Mzali',
    description: 'Service client Boutique Ahmed Mzali. Joignable par téléphone et WhatsApp (+216 22 479 443).',
    images: ['https://ahmedmzaliboutique.tn/og-image.jpg'],
  },
};

export default async function ContactPage() {
  const lang = await getCurrentLang();
  const t = getDictionary(lang);
  const saved = await getSiteSettings();
  const categories = await categoryService.list({ hideEmpty: true }).catch(() => []);

  const phone = saved.phones?.[0] ?? SITE.contact.phone;
  const whatsapp = saved.whatsapp ?? SITE.contact.whatsapp;
  const email = SITE.contact.email;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    name: 'Contact Boutique Ahmed Mzali',
    url: 'https://ahmedmzaliboutique.tn/contact',
    mainEntity: {
      '@type': 'Organization',
      name: 'Boutique Ahmed Mzali',
      url: 'https://ahmedmzaliboutique.tn',
      logo: 'https://ahmedmzaliboutique.tn/hero.webp',
      contactPoint: {
        '@type': 'ContactPoint',
        telephone: `+216${phone}`,
        contactType: 'customer service',
        areaServed: 'TN',
        availableLanguage: ['French', 'Arabic'],
      },
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Header categories={categories.map((c) => ({ name: c.name, slug: c.slug }))} />

      <main className="container-shop py-10 lg:py-16">
        <div className="mx-auto max-w-4xl">
          <header className="mb-10 text-center">
            <span className="text-xs font-bold uppercase tracking-widest text-brand-500">
              {t.footer.help}
            </span>
            <h1 className="mt-2 text-3xl font-black uppercase tracking-tight text-ink-900 md:text-4xl">
              {t.trustPages.contactTitle}
            </h1>
            <p className="mt-3 text-base text-ink-700 max-w-2xl mx-auto">
              {t.trustPages.contactSubtitle}
            </p>
          </header>

          <div className="grid gap-8 md:grid-cols-2">
            {/* Contact Information Cards */}
            <div className="space-y-4">
              <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-card transition hover:border-brand-300">
                <div className="flex items-start gap-4">
                  <div className="rounded-xl bg-brand-50 p-3 text-brand-500">
                    <Phone size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-ink-900">{t.trustPages.phone}</h3>
                    <p className="mt-1 text-sm text-ink-600">Appelez notre équipe directement :</p>
                    <a
                      href={`tel:${phone}`}
                      className="mt-2 inline-block font-black text-brand-600 text-lg hover:underline"
                    >
                      +216 {phone}
                    </a>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-card transition hover:border-[#25D366]">
                <div className="flex items-start gap-4">
                  <div className="rounded-xl bg-emerald-50 p-3 text-[#25D366]">
                    <MessageCircle size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-ink-900">{t.trustPages.whatsapp}</h3>
                    <p className="mt-1 text-sm text-ink-600">Assistance rapide par message :</p>
                    <a
                      href={`https://wa.me/216${whatsapp}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#1EBE5D]"
                    >
                      <MessageCircle size={16} /> Discuter sur WhatsApp
                    </a>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-card">
                <div className="flex items-start gap-4">
                  <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
                    <Mail size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-ink-900">{t.trustPages.email}</h3>
                    <p className="mt-1 text-sm text-ink-600">Pour toute demande formelle :</p>
                    <a
                      href={`mailto:${email}`}
                      className="mt-2 inline-block font-semibold text-blue-600 hover:underline"
                    >
                      {email}
                    </a>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-card">
                <div className="flex items-start gap-4">
                  <div className="rounded-xl bg-amber-50 p-3 text-amber-600">
                    <Clock size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-ink-900">{t.trustPages.hours}</h3>
                    <p className="mt-1 text-sm font-medium text-ink-800">{t.trustPages.hoursValue}</p>
                    <p className="mt-1 text-xs text-ink-500">Livraison assurée 6j/7 sur toute la Tunisie</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Contact Form / Direct Reach */}
            <div className="rounded-2xl border border-ink-100 bg-white p-8 shadow-card flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 border-b border-ink-100 pb-4">
                  <ShieldCheck size={24} className="text-cta" />
                  <div>
                    <h2 className="text-lg font-black text-ink-900">Boutique Ahmed Mzali</h2>
                    <p className="text-xs text-ink-500">Commerce vérifié · Tunisie</p>
                  </div>
                </div>

                <div className="mt-6 space-y-4 text-sm text-ink-700">
                  <p className="leading-relaxed">
                    Vous avez une question concernant un article, une taille, ou l’état de livraison de votre colis ?
                  </p>
                  <p className="leading-relaxed">
                    Notre service client vous répond directement et vous accompagne jusqu’à la bonne réception de votre commande.
                  </p>

                  <div className="rounded-xl bg-ink-50 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-ink-800 font-bold">
                      <MapPin size={16} className="text-brand-500" />
                      <span>{t.footer.location}</span>
                    </div>
                    <p className="text-xs text-ink-500">
                      Livraison partout en Tunisie : Grand Tunis, Sousse, Sfax, Bizerte, Nabeul, et tous les gouvernorats.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-ink-100">
                <a
                  href={`https://wa.me/216${whatsapp}?text=${encodeURIComponent('Bonjour Boutique Ahmed Mzali, je souhaite avoir des informations.')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary w-full justify-center gap-2 py-3.5 text-base"
                >
                  <Send size={18} /> {t.trustPages.sendButton}
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
