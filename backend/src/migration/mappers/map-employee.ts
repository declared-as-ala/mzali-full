export type LegacyEmployeeRow = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LegacyAdminFile = { passwordHash: string; salt: string; updatedAt: string };

export type MappedEmployee = {
  legacyId: string;
  email: string;
  name: string;
  role: 'employee' | 'super_admin';
  active: boolean;
  passwordHash: { algo: 'scrypt-legacy'; hash: string; salt: string };
  mustChangePassword: boolean;
};

const ADMIN_EMAIL = 'admin@mzali.local';

export function mapLegacyEmployee(row: LegacyEmployeeRow): MappedEmployee {
  return {
    legacyId: row.id,
    email: row.email.trim().toLowerCase(),
    name: row.name,
    role: 'employee',
    active: row.active,
    passwordHash: { algo: 'scrypt-legacy', hash: row.passwordHash, salt: row.salt },
    mustChangePassword: false,
  };
}

export function mapLegacyAdmin(file: LegacyAdminFile): MappedEmployee {
  return {
    legacyId: 'admin',
    email: ADMIN_EMAIL,
    name: 'Mzali Admin',
    role: 'super_admin',
    active: true,
    passwordHash: { algo: 'scrypt-legacy', hash: file.passwordHash, salt: file.salt },
    mustChangePassword: false,
  };
}

/** Validates a raw JSON row before import; returns a reason string when invalid. */
export function validateLegacyEmployeeRow(row: unknown): string | null {
  if (!row || typeof row !== 'object') return 'not an object';
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return 'missing id';
  if (typeof r.email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) return 'invalid email';
  if (typeof r.name !== 'string' || !r.name.trim()) return 'missing name';
  if (typeof r.passwordHash !== 'string' || !r.passwordHash) return 'missing passwordHash';
  if (typeof r.salt !== 'string' || !r.salt) return 'missing salt';
  return null;
}
