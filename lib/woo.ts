/**
 * @deprecated
 * UI code MUST NOT import from this file anymore.
 * Use the normalized services instead:
 *   import { productService, categoryService, orderService } from '@/services';
 *
 * This file is kept temporarily for backwards compatibility with any legacy admin
 * code that still depends on the raw WooCommerce shapes. It will be removed when
 * we cut over to the custom backend in Phase 2.
 */
export { wooClient as woo } from '@/services/woo/woo-client';
export type { WooProductRaw as WooProduct, WooCategoryRaw as WooCategory, WooOrderRaw as WooOrder } from '@/services/woo/woo-types';
