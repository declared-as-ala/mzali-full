import { ALL_PERMISSIONS, isAdminRole, roleHasPermission } from './permissions';

describe('permissions', () => {
  it('grants every permission to super_admin and admin (current-system parity)', () => {
    for (const p of ALL_PERMISSIONS) {
      expect(roleHasPermission('super_admin', p)).toBe(true);
      expect(roleHasPermission('admin', p)).toBe(true);
    }
  });

  it('gives cashier full order CRUD (parity with admin order management) plus POS operations', () => {
    expect(roleHasPermission('cashier', 'orders.read')).toBe(true);
    expect(roleHasPermission('cashier', 'orders.write')).toBe(true);
    expect(roleHasPermission('cashier', 'orders.delete')).toBe(true);
    expect(roleHasPermission('cashier', 'shipping.push')).toBe(true);
    expect(roleHasPermission('cashier', 'pos.sell')).toBe(true);
    expect(roleHasPermission('cashier', 'employees.manage')).toBe(false);
    expect(roleHasPermission('cashier', 'settings.manage')).toBe(false);
    expect(roleHasPermission('cashier', 'coupons.write')).toBe(false);
  });

  it('keeps viewer read-only', () => {
    expect(roleHasPermission('viewer', 'orders.read')).toBe(true);
    expect(roleHasPermission('viewer', 'orders.write')).toBe(false);
    expect(roleHasPermission('viewer', 'products.write')).toBe(false);
    expect(roleHasPermission('viewer', 'inventory.adjust')).toBe(false);
  });

  it('identifies admin roles', () => {
    expect(isAdminRole('super_admin')).toBe(true);
    expect(isAdminRole('admin')).toBe(true);
    expect(isAdminRole('cashier')).toBe(false);
    expect(isAdminRole('viewer')).toBe(false);
  });
});
