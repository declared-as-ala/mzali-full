import { Command, CommandRunner } from 'nest-commander';
import { Inject } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import Redis from 'ioredis';
import { REDIS } from '@/redis/redis.constants';

/**
 * `node dist/cli.js verify-config`
 * Boots with full env validation (fails on invalid config) and checks that
 * MongoDB and Redis are reachable. Used by deploy scripts as a preflight.
 */
@Command({ name: 'verify-config', description: 'Validate env and check Mongo/Redis connectivity' })
export class VerifyConfigCommand extends CommandRunner {
  constructor(
    @InjectConnection() private readonly mongo: Connection,
    @Inject(REDIS) private readonly redis: Redis,
  ) {
    super();
  }

  async run(): Promise<void> {
    const mongoOk = this.mongo.readyState === 1;
    const redisOk = (await this.redis.ping().catch(() => 'FAIL')) === 'PONG';
    console.log(`mongodb: ${mongoOk ? 'ok' : 'FAIL'}`);
    console.log(`redis:   ${redisOk ? 'ok' : 'FAIL'}`);
    if (!mongoOk || !redisOk) process.exitCode = 1;
  }
}
