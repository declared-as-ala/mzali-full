import { mapLegacyAdmin, mapLegacyEmployee, validateLegacyEmployeeRow } from './map-employee';

describe('mapLegacyEmployee', () => {
  it('maps a legacy JSON row into a scrypt-legacy employee record', () => {
    const m = mapLegacyEmployee({
      id: 'uuid-1', email: 'Test@Example.com', name: 'Test User',
      passwordHash: 'abcd', salt: 'ef01', active: true,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    });
    expect(m).toEqual({
      legacyId: 'uuid-1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'employee',
      active: true,
      passwordHash: { algo: 'scrypt-legacy', hash: 'abcd', salt: 'ef01' },
      mustChangePassword: false,
    });
  });
});

describe('mapLegacyAdmin', () => {
  it('maps the admin.json file into a super_admin record with legacyId "admin"', () => {
    const m = mapLegacyAdmin({ passwordHash: 'hash', salt: 'salt', updatedAt: '2026-01-01T00:00:00Z' });
    expect(m.legacyId).toBe('admin');
    expect(m.role).toBe('super_admin');
    expect(m.email).toBe('admin@mzali.local');
    expect(m.passwordHash).toEqual({ algo: 'scrypt-legacy', hash: 'hash', salt: 'salt' });
  });
});

describe('validateLegacyEmployeeRow', () => {
  const valid = { id: 'x', email: 'a@b.com', name: 'A', passwordHash: 'h', salt: 's' };

  it('accepts a well-formed row', () => {
    expect(validateLegacyEmployeeRow(valid)).toBeNull();
  });

  it('rejects a missing or invalid email', () => {
    expect(validateLegacyEmployeeRow({ ...valid, email: 'not-an-email' })).toMatch(/email/);
    expect(validateLegacyEmployeeRow({ ...valid, email: '' })).toMatch(/email/);
  });

  it('rejects a missing name', () => {
    expect(validateLegacyEmployeeRow({ ...valid, name: '  ' })).toMatch(/name/);
  });

  it('rejects a missing passwordHash or salt', () => {
    expect(validateLegacyEmployeeRow({ ...valid, passwordHash: '' })).toMatch(/passwordHash/);
    expect(validateLegacyEmployeeRow({ ...valid, salt: '' })).toMatch(/salt/);
  });

  it('rejects a non-object input', () => {
    expect(validateLegacyEmployeeRow(null)).toMatch(/object/);
    expect(validateLegacyEmployeeRow('string')).toMatch(/object/);
  });
});
