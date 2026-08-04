import type { EmployeeRole } from '@contracts';

/**
 * Code-defined permission catalog (no role-editor UI — deliberate scope
 * decision). `super_admin` and `admin` both hold every permission to match
 * the current system where the single admin does everything. The narrower
 * roles exist for future delegation without schema changes.
 */
export const ALL_PERMISSIONS = [
  'products.read',
  'products.write',
  'categories.read',
  'categories.write',
  'orders.read',
  'orders.write',
  'orders.delete',
  'orders.print',
  'orders.export',
  'orders.bulk_update',
  'customers.read',
  'customers.delete',
  'coupons.read',
  'coupons.write',
  'inventory.read',
  'inventory.adjust',
  'media.read',
  'media.write',
  'shipping.push',
  'employees.read',
  'employees.manage',
  'settings.manage',
  'audit.read',
  'stats.read',
  // POS (Sprint 2+) — see docs/pos-platform/security-model.md
  'pos.open_session',
  'pos.close_session',
  'pos.sell',
  'pos.view_boutique_stock',
  'pos.view_depot_stock',
  'pos.apply_basic_discount',
  'pos.apply_advanced_discount',
  'pos.cancel_item',
  'pos.cancel_sale',
  'pos.refund',
  'pos.exchange',
  'pos.reprint_ticket',
  'pos.open_cash_drawer',
  'pos.view_reports',
  'pos.request_transfer',
  'pos.override_stock',
  'pos.edit_sale',
  // Transfers/stocktakes (Sprint 5)
  'inventory.transfer_approve',
  'inventory.stocktake_approve',
  // Suppliers/purchasing (Sprint 6)
  'purchasing.manage',
  'inventory.view_cost',
  // Quotes/invoices (Sprint 7)
  'documents.manage',
  'documents.finalize',
  // Loyalty (Sprint 8)
  'loyalty.view',
  'loyalty.manage',
  'loyalty.adjust',
  // POS analytics control center
  'pos.analytics.read',
  'pos.analytics.costs',
  'pos.analytics.export',
  'pos.sessions.read',
  'pos.sessions.review',
  'pos.terminals.manage',
  'pos.alerts.read',
  'pos.alerts.configure',
  // Loyalty PVC cards
  'loyalty.cards.manage',
  'loyalty.cards.generate',
  'loyalty.cards.export',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

const ALL: readonly Permission[] = ALL_PERMISSIONS;

const ROLE_PERMISSIONS: Record<EmployeeRole, readonly Permission[]> = {
  super_admin: ALL,
  admin: ALL,
  order_manager: [
    'orders.read', 'orders.write', 'orders.print', 'orders.export', 'orders.bulk_update',
    'customers.read', 'products.read', 'categories.read',
    'shipping.push', 'stats.read',
    'documents.manage', 'documents.finalize',
    // Boutique performance visible, purchase costs are not — see
    // pos-analytics.controller.ts's own cost-stripping gate.
    'pos.analytics.read',
  ],
  catalog_manager: [
    'products.read', 'products.write',
    'categories.read', 'categories.write',
    'media.read', 'media.write',
    'inventory.read', 'inventory.adjust',
  ],
  viewer: [
    'products.read', 'categories.read', 'orders.read',
    'customers.read', 'inventory.read', 'stats.read',
    'pos.analytics.read',
  ],
  /** Boutique till operator, and the only non-admin role exposed in the
   *  admin UI (labeled "Employé" there — see EmployeesView.tsx). Formerly
   *  split across a near-identical 'employee' role (orders admin access)
   *  and this 'cashier' role (POS access); merged into one since every
   *  account needs both. */
  cashier: [
    'orders.read', 'orders.write', 'shipping.push',
    'pos.open_session', 'pos.close_session', 'pos.sell',
    'pos.view_boutique_stock', 'pos.view_depot_stock',
    'pos.apply_basic_discount', 'pos.reprint_ticket',
    'pos.open_cash_drawer',
    'products.read', 'categories.read', 'customers.read',
    'loyalty.view',
    'pos.edit_sale', 'pos.view_reports', 'pos.cancel_sale', 'pos.refund',
  ],
  /** All cashier permissions plus approvals/refunds/adjustments. */
  store_manager: [
    'pos.open_session', 'pos.close_session', 'pos.sell',
    'pos.view_boutique_stock', 'pos.view_depot_stock',
    'pos.apply_basic_discount', 'pos.apply_advanced_discount',
    'pos.cancel_item', 'pos.cancel_sale', 'pos.refund', 'pos.exchange',
    'pos.reprint_ticket', 'pos.open_cash_drawer', 'pos.view_reports',
    'pos.request_transfer', 'pos.override_stock', 'pos.edit_sale',
    'products.read', 'categories.read', 'customers.read',
    'inventory.read', 'inventory.adjust', 'stats.read',
    'inventory.transfer_approve', 'inventory.stocktake_approve',
    'purchasing.manage', 'inventory.view_cost',
    'documents.manage', 'documents.finalize',
    'loyalty.view', 'loyalty.manage', 'loyalty.adjust',
    'pos.analytics.read', 'pos.analytics.costs', 'pos.analytics.export',
    'pos.sessions.read', 'pos.sessions.review', 'pos.terminals.manage',
    'pos.alerts.read', 'pos.alerts.configure',
    'loyalty.cards.manage', 'loyalty.cards.generate', 'loyalty.cards.export',
  ],
};

export function roleHasPermission(role: EmployeeRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Roles with unrestricted (non-ownership-scoped) access to admin surfaces. */
export function isAdminRole(role: EmployeeRole): boolean {
  return role === 'super_admin' || role === 'admin';
}
