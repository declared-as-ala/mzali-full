import * as argon2 from 'argon2';

/**
 * PIN hashing for the isolated Pointage/attendance system — deliberately
 * its own module, not a re-export of `auth/password.ts`. That file's
 * `PasswordHash` type is coupled to `users/employee.schema.ts` (the
 * login/POS Employee, argon2id + legacy-scrypt dual support for migrated
 * accounts); attendance employees are a brand new domain with no legacy
 * data to support, so a plain argon2id hash string is enough — keeping
 * this file free of any import from `users/` or `auth/` is the isolation
 * guarantee itself, not just a naming convention.
 */
export async function hashPin(pin: string): Promise<string> {
  return argon2.hash(pin, { type: argon2.argon2id });
}

export async function verifyPin(hash: string, pin: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, pin);
  } catch {
    return false;
  }
}

/** 4-6 digit numeric PIN — enough entropy for a kiosk when combined with
 *  rate limiting + lockout (see AttendancePublicController), not meant to
 *  stand alone the way a real password does. */
export function isValidPinFormat(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}
