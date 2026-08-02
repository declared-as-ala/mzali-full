import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisLockService } from './redis-lock.service';
import { REDIS } from './redis.constants';

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis(config.getOrThrow<string>('REDIS_URL'), {
          maxRetriesPerRequest: 2,
          lazyConnect: false,
        }),
    },
    RedisLockService,
  ],
  exports: [REDIS, RedisLockService],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status !== 'end') await this.redis.quit();
  }
}

export { REDIS } from './redis.constants';
