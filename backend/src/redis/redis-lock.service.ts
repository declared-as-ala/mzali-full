import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { REDIS } from './redis.constants';

/**
 * Simple single-instance Redis lock (SET NX PX + token-checked release).
 * Sufficient for this deployment (one Redis); not a multi-node Redlock.
 */
@Injectable()
export class RedisLockService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Try to acquire `key` for `ttlMs`. Returns a release function or null. */
  async acquire(key: string, ttlMs: number): Promise<(() => Promise<void>) | null> {
    const token = randomUUID();
    const ok = await this.redis.set(key, token, 'PX', ttlMs, 'NX');
    if (ok !== 'OK') return null;
    return async () => {
      // Release only if we still own the lock
      await this.redis.eval(
        `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`,
        1,
        key,
        token,
      );
    };
  }

  /**
   * Acquire with a short retry window, then run `fn` and always release.
   * Throws if the lock cannot be acquired within `waitMs`.
   */
  async withLock<T>(key: string, ttlMs: number, waitMs: number, fn: () => Promise<T>): Promise<T> {
    const deadline = Date.now() + waitMs;
    let release = await this.acquire(key, ttlMs);
    while (!release) {
      if (Date.now() > deadline) throw new Error(`Could not acquire lock: ${key}`);
      await new Promise((r) => setTimeout(r, 100));
      release = await this.acquire(key, ttlMs);
    }
    try {
      return await fn();
    } finally {
      await release();
    }
  }
}
