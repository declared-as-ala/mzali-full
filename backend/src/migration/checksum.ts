import { createHash } from 'node:crypto';

/** Deterministic sha256 of any JSON-serializable value — used for idempotency. */
export function checksumOf(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
