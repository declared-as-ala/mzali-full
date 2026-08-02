/**
 * File-backed employee store for Phase 1 (no DB).
 * Phase 2: replace with Prisma — the EmployeeService interface stays the same.
 */
import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'employees.json');

export type Employee = {
  id: string;
  email: string;
  name: string;
  role?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type StoredEmployee = Employee & { passwordHash: string; salt: string };

async function readAll(): Promise<StoredEmployee[]> {
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    const parsed = JSON.parse(raw) as StoredEmployee[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(list: StoredEmployee[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(list, null, 2), 'utf8');
}

function hash(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function publicOf(e: StoredEmployee): Employee {
  const { passwordHash: _ph, salt: _s, ...rest } = e;
  return rest;
}

function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return crypto.randomBytes(8).toString('hex');
}

function timingSafeEq(a: string, b: string): boolean {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

export const employeeStore = {
  async list(): Promise<Employee[]> {
    const all = await readAll();
    return all.map(publicOf);
  },

  async get(id: string): Promise<Employee | null> {
    const all = await readAll();
    const found = all.find((e) => e.id === id);
    return found ? publicOf(found) : null;
  },

  async getByEmail(email: string): Promise<Employee | null> {
    const all = await readAll();
    const norm = email.trim().toLowerCase();
    const found = all.find((e) => e.email.toLowerCase() === norm);
    return found ? publicOf(found) : null;
  },

  async verifyCredentials(email: string, password: string): Promise<Employee | null> {
    const all = await readAll();
    const norm = email.trim().toLowerCase();
    const found = all.find((e) => e.email.toLowerCase() === norm);
    if (!found || !found.active) return null;
    const computed = hash(password, found.salt);
    if (!timingSafeEq(computed, found.passwordHash)) return null;
    return publicOf(found);
  },

  async create(input: { email: string; name: string; password: string; active?: boolean; role?: string }): Promise<Employee> {
    const email = input.email.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Email invalide');
    if (!input.password || input.password.length < 6) throw new Error('Mot de passe trop court (min 6 caractères)');
    if (!input.name?.trim()) throw new Error('Nom requis');

    const all = await readAll();
    if (all.some((e) => e.email.toLowerCase() === email)) throw new Error('Email déjà utilisé');

    const salt = crypto.randomBytes(16).toString('hex');
    const now = new Date().toISOString();
    const employee: StoredEmployee = {
      id: newId(),
      email,
      name: input.name.trim(),
      role: input.role ?? 'cashier',
      passwordHash: hash(input.password, salt),
      salt,
      active: input.active ?? true,
      createdAt: now,
      updatedAt: now,
    };
    all.push(employee);
    await writeAll(all);
    return publicOf(employee);
  },

  async update(
    id: string,
    input: { email?: string; name?: string; active?: boolean; password?: string; role?: string },
  ): Promise<Employee> {
    const all = await readAll();
    const idx = all.findIndex((e) => e.id === id);
    if (idx < 0) throw new Error('Employé introuvable');
    const cur = all[idx];

    if (input.email !== undefined) {
      const next = input.email.trim().toLowerCase();
      if (!next || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next)) throw new Error('Email invalide');
      if (all.some((e) => e.id !== id && e.email.toLowerCase() === next)) throw new Error('Email déjà utilisé');
      cur.email = next;
    }
    if (input.name !== undefined) {
      if (!input.name.trim()) throw new Error('Nom requis');
      cur.name = input.name.trim();
    }
    if (input.role !== undefined) cur.role = input.role;
    if (input.active !== undefined) cur.active = input.active;
    if (input.password) {
      if (input.password.length < 6) throw new Error('Mot de passe trop court (min 6 caractères)');
      cur.salt = crypto.randomBytes(16).toString('hex');
      cur.passwordHash = hash(input.password, cur.salt);
    }
    cur.updatedAt = new Date().toISOString();
    all[idx] = cur;
    await writeAll(all);
    return publicOf(cur);
  },

  /** Soft-delete: deactivate instead of erasing — order references stay intact. */
  async softDelete(id: string): Promise<void> {
    await this.update(id, { active: false });
  },

  async delete(id: string): Promise<void> {
    const all = await readAll();
    const idx = all.findIndex((e) => e.id === id);
    if (idx < 0) throw new Error('Employé introuvable');
    all.splice(idx, 1);
    await writeAll(all);
  },
};
