import type { MetadataRoute } from 'next';
import { productService, categoryService } from '@/services';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://ahmedmzaliboutique.tn';
  const now = new Date();

  // Static trust and core pages
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/shop`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/livraison`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/cgv`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/politique-confidentialite`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/mentions-legales`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ];

  // Dynamic category routes
  let categoryRoutes: MetadataRoute.Sitemap = [];
  try {
    const categories = await categoryService.list({ hideEmpty: true });
    categoryRoutes = categories
      .filter((c) => c.slug && c.slug.trim() !== '')
      .map((c) => ({
        url: `${baseUrl}/categorie/${encodeURIComponent(c.slug)}`,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }));
  } catch {
    categoryRoutes = [];
  }

  // Dynamic published product routes
  let productRoutes: MetadataRoute.Sitemap = [];
  try {
    const productsRes = await productService.list({ perPage: 250, status: 'published' });
    productRoutes = productsRes.items
      .filter((p) => p.slug && p.slug.trim() !== '')
      .map((p) => ({
        url: `${baseUrl}/produit/${encodeURIComponent(p.slug)}`,
        lastModified: now,
        changeFrequency: 'daily' as const,
        priority: 0.9,
      }));
  } catch {
    productRoutes = [];
  }

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
