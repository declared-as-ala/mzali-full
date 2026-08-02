import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import ProductCard from '@/components/site/ProductCard';
import { productService, categoryService } from '@/services';
import { SITE } from '@/lib/site-config';
import { getSiteSettings } from '@/lib/admin-storage';
import { Truck, ShieldCheck, Phone, MessageCircle } from 'lucide-react';
import { getDictionary } from '@/lib/i18n';
import { getCurrentLang } from '@/lib/i18n-server';
import type { Product } from '@/types';

export default async function Home() {
  const lang = await getCurrentLang();
  const t = getDictionary(lang);
  const saved = await getSiteSettings();
  const primaryPhone = saved.phones?.[0] ?? SITE.contact.phone;
  const whatsapp = saved.whatsapp ?? SITE.contact.whatsapp;
  const [firstProductsResult, categories] = await Promise.all([
    productService.list({ perPage: 100, orderBy: 'date' }).catch(() => ({ items: [] as Product[], total: 0, totalPages: 0, page: 1 })),
    categoryService.list({ hideEmpty: true }).catch(() => []),
  ]);
  
  let products: Product[] = firstProductsResult.items;

  if (firstProductsResult.totalPages > 1) {
    const promises: Promise<Product[]>[] = [];
    for (let p = 2; p <= firstProductsResult.totalPages; p++) {
      promises.push(
        productService.list({ perPage: 100, orderBy: 'date', page: p })
          .then((res) => res.items)
          .catch(() => [] as Product[])
      );
    }
    const additionalPages = await Promise.all(promises);
    products = products.concat(additionalPages.flat());
  }

  return (
    <>
      <Header categories={categories.map((c) => ({ name: c.name, slug: c.slug }))} />

      <section className="border-b border-ink-200 bg-white">
        <div className="container-shop flex flex-wrap items-center justify-around gap-y-3 py-3 text-xs font-bold text-ink-700 sm:text-sm">
          <span className="inline-flex items-center gap-2"><Truck size={16} className="text-brand-500" /> {t.hero.deliveryTunisia}</span>
          <span className="hidden h-4 w-px bg-ink-200 sm:block" />
          <span className="inline-flex items-center gap-2"><ShieldCheck size={16} className="text-cta" /> {t.hero.cashOnDelivery}</span>
          <span className="hidden h-4 w-px bg-ink-200 sm:block" />
          <a href={`tel:${primaryPhone}`} className="inline-flex items-center gap-2 hover:text-brand-500"><Phone size={16} /> {primaryPhone}</a>
          <span className="hidden h-4 w-px bg-ink-200 sm:block" />
          <a href={`https://wa.me/216${whatsapp}`} target="_blank" rel="noopener" className="inline-flex items-center gap-2 hover:text-[#25D366]"><MessageCircle size={16} /> {t.common.whatsapp}</a>
        </div>
      </section>

      <main className="container-shop">
        <section id="produits" className="pb-12 pt-6">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-brand-500">{t.home.featured}</p>
              <h2 className="mt-1 text-2xl font-black uppercase tracking-tight text-ink-900 md:text-3xl">
                {t.home.productsTitle}
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => <ProductCard key={p.id} product={p} lang={lang} />)}
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
