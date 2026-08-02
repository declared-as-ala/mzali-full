/**
 * Service factory.
 * THIS is the only place that knows which backend powers the storefront.
 *
 * COMMERCE_PROVIDER=woocommerce (default) | mzali-api
 * The flag exists purely for safe cutover and rollback during the
 * migration; flip it and restart to switch backends with zero other code
 * changes. See docs/rollback-plan.md.
 */
import type { ProductService } from './product-service';
import type { CategoryService } from './category-service';
import type { OrderService } from './order-service';
import type { EmployeeService } from './employee-service';
import { WooCommerceProductService } from './woo/woo-product-service';
import { WooCommerceCategoryService } from './woo/woo-category-service';
import { WooCommerceOrderService } from './woo/woo-order-service';
import { FileEmployeeService } from './employees/file-employee-service';
import { MzaliApiProductService } from './mzali-api/mzali-product-service';
import { MzaliApiCategoryService } from './mzali-api/mzali-category-service';
import { MzaliApiOrderService } from './mzali-api/mzali-order-service';
import { MzaliApiEmployeeService } from './mzali-api/mzali-employee-service';

const provider = process.env.COMMERCE_PROVIDER ?? 'woocommerce';
const useMzaliApi = provider === 'mzali-api';

export const productService: ProductService = useMzaliApi
  ? new MzaliApiProductService()
  : new WooCommerceProductService();

export const categoryService: CategoryService = useMzaliApi
  ? new MzaliApiCategoryService()
  : new WooCommerceCategoryService();

export const orderService: OrderService = useMzaliApi
  ? new MzaliApiOrderService()
  : new WooCommerceOrderService();

export const employeeService: EmployeeService = useMzaliApi
  ? new MzaliApiEmployeeService()
  : new FileEmployeeService();

export type { ProductService } from './product-service';
export type { CategoryService } from './category-service';
export type { OrderService } from './order-service';
export type { EmployeeService, Employee } from './employee-service';
