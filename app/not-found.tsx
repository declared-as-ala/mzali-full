import Link from 'next/link';
import Image from 'next/image';
import { SITE } from '@/lib/site-config';
import { ShoppingBag, Home, HelpCircle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-ink-50 flex flex-col justify-between">
      <header className="border-b border-ink-100 bg-white py-4">
        <div className="container-shop flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image src={SITE.logo} alt={SITE.name} width={40} height={40} className="h-10 w-10 rounded-full object-cover" unoptimized />
            <span className="text-lg font-black text-ink-900">{SITE.name}</span>
          </Link>
          <Link href="/shop" className="text-sm font-bold text-brand-600 hover:text-brand-700">
            Voir la boutique →
          </Link>
        </div>
      </header>

      <main className="container-shop py-16 text-center my-auto">
        <div className="mx-auto max-w-md">
          <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-3xl bg-brand-50 text-brand-500">
            <HelpCircle size={40} />
          </div>
          <span className="text-xs font-extrabold uppercase tracking-widest text-brand-500">
            Erreur 404
          </span>
          <h1 className="mt-2 text-3xl font-black text-ink-900 md:text-4xl">
            Page introuvable
          </h1>
          <p className="mt-3 text-sm text-ink-600 leading-relaxed">
            Désolé, la page que vous recherchez n’existe pas, a été déplacée ou son lien est temporairement indisponible.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/" className="btn-primary w-full sm:w-auto justify-center gap-2 py-3">
              <Home size={18} /> Retour à l’accueil
            </Link>
            <Link href="/shop" className="btn-secondary w-full sm:w-auto justify-center gap-2 py-3">
              <ShoppingBag size={18} /> Explorer les produits
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-ink-200 bg-white py-6 text-center text-xs text-ink-500">
        © {new Date().getFullYear()} {SITE.name}. Tous droits réservés.
      </footer>
    </div>
  );
}
