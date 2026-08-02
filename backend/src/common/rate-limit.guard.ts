import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable, mixin, Type } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from '@/redis/redis.constants';

/**
 * Fixed-window IP rate limiter backed by Redis (INCR + EXPIRE on the first
 * hit of each window — single round trip, no extra Lua script needed for
 * this simple case). Not distributed-safe beyond "one Redis instance",
 * which matches this deployment (see RedisLockService's own note).
 *
 * Usage: `@UseGuards(RateLimitGuard(20, 60))` — max 20 requests per IP per
 * 60-second window, keyed by the decorated handler's method name so two
 * routes using this guard never share a counter.
 */
export function RateLimitGuard(max: number, windowSeconds: number): Type<CanActivate> {
  @Injectable()
  class RateLimitGuardMixin implements CanActivate {
    constructor(@Inject(REDIS) private readonly redis: Redis) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const req = context.switchToHttp().getRequest<{ ip: string }>();
      const routeKey = context.getHandler().name;
      const key = `ratelimit:${routeKey}:${req.ip}`;
      const count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, windowSeconds);
      if (count > max) {
        throw new HttpException('Trop de tentatives, réessayez plus tard.', HttpStatus.TOO_MANY_REQUESTS);
      }
      return true;
    }
  }
  return mixin(RateLimitGuardMixin);
}
