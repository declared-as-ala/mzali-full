import { randomBytes } from 'node:crypto';

/** Alphabet with no 0/O/1/I ambiguity — safe for humans to read/type aloud. */
export const READABLE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** A random code drawn from `chars`, `length` characters long. Not
 *  sequential, not guessable from a counter — see PosTerminalsService's
 *  identical pairing-code generator, which this mirrors. */
export function randomCode(length: number, chars: string = READABLE_ALPHABET): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

/** Cryptographically random opaque token (base64url) — for QR payloads
 *  that must not be derivable from any visible identifier. */
export function randomToken(byteLength = 24): string {
  return randomBytes(byteLength).toString('base64url');
}
