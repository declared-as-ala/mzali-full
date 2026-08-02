import { ALL_PERMISSIONS, isAdminRole, roleHasPermission } from './permissions';

describe('permissions', () => {
  it('grants every permission to super_admin and admin (current-system parity)', () => {
    for (const p of ALL_PERMISSIONS) {
      expect(roleHasPermission('super_admin', p)).toBe(true);
      expect(roleHasPermission('admin', p)).toBe(true);
    }
  });

  it('scopes employee role to own-order operations', () => {
    expect(roleHasPermission('employee', 'orders.read')).toBe(true);
    expect(roleHasPermission('employee', 'orders.write')).toBe(true);
    expect(roleHasPermission('employee', 'shipping.push')).toBe(true);
    expect(roleHasPermission('employee', 'orders.delete')).toBe(false);
    expect(roleHasPermission('employee', 'employees.manage')).toBe(false);
    expect(roleHasPermission('employee', 'settings.manage')).toBe(false);
    expect(roleHasPermission('employee', 'coupons.write')).toBe(false);
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
    expect(isAdminRole('employee')).toBe(false);
    expect(isAdminRole('viewer')).toBe(false);
  });
});
