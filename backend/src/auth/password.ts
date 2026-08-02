import * as argon2 from 'argon2';
import { scryptSync, timingSafeEqual } from 'node:crypto';
import type { PasswordHash } from '@/users/employee.schema';

/**
 * Password hashing.
 * - New hashes: Argon2id (library defaults are current OWASP-reasonable).
 * - Legacy: scrypt hex hashes migrated from data/employees.json /
 *   data/admin.json — verified compatibly, then transparently rehashed to
 *   Argon2id on the first successful login (see AuthService).
 */

export async function hashPassword(plain: string): Promise<PasswordHash> {
  const hash = await argon2.hash(plain, { type: argon2.argon2id });
  return { algo: 'argon2id', hash };
}

export async function verifyPassword(stored: PasswordHash, plain: string): Promise<boolean> {
  if (stored.algo === 'argon2id') {
    try {
      return await argon2.verify(stored.hash, plain);
    } catch {
      return false;
    }
  }
  // scrypt-legacy: hash = scryptSync(password, saltHex, 64).toString('hex')
  if (!stored.salt) return false;
  try {
    const derived = scryptSync(plain, stored.salt, 64);
    const expected = Buffer.from(stored.hash, 'hex');
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function needsRehash(stored: PasswordHash): boolean {
  return stored.algo !== 'argon2id';
}
