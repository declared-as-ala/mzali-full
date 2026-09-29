import { revalidatePath } from 'next/cache';

/**
 * Drops the cached (ISR, revalidate = 60) public pages that render product
 * options / variants, so an admin change is visible immediately instead of up
 * to a minute later. Call after any successful product or variant mutation.
 * Never throws: a failed revalidation must not fail the admin's save.
 */
export function revalidateStorefront(): void {
  try {
    revalidatePath('/produit/[slug]', 'page');
    revalidatePath('/categorie/[slug]', 'page');
    revalidatePath('/shop');
    revalidatePath('/');
  } catch (error) {
    console.error('revalidateStorefront failed', error);
  }
}
