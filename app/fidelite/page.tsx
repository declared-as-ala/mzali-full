import type { Metadata } from 'next';
import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import FideliteLookup from '@/components/site/FideliteLookup';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Programme de Fidélité',
  description: 'Consultez votre solde de points et vos avantages fidélité chez Boutique Ahmed Mzali.',
  alternates: {
    canonical: 'https://ahmedmzaliboutique.tn/fidelite',
  },
};

export default function FidelitePage() {
  return (
    <>
      <Header categories={[]} />
      <main className="container-shop py-12">
        <div className="mx-auto max-w-lg rounded-3xl bg-white p-8 shadow-card">
          <h1 className="mb-2 text-center text-3xl font-black text-ink-900">Programme fidélité</h1>
          <p className="mb-6 text-center text-ink-700">
            Entrez votre numéro de téléphone ou votre numéro de carte pour consulter votre solde de points.
          </p>
          <FideliteLookup />
        </div>
      </main>
      <Footer />
    </>
  );
}
