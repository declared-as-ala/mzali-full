import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ApiTags } from '@nestjs/swagger';
import Redis from 'ioredis';
import { Connection } from 'mongoose';
import { REDIS } from '@/redis/redis.constants';

@ApiTags('health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    @InjectConnection() private readonly mongo: Connection,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Liveness + dependency summary (no sensitive details exposed). */
  @Get()
  async health() {
    const checks = await this.runChecks();
    const ok = Object.values(checks).every(Boolean);
    if (!ok) throw new ServiceUnavailableException({ status: 'degraded', checks });
    return { status: 'ok', checks };
  }

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    const checks = await this.runChecks();
    const ok = Object.values(checks).every(Boolean);
    if (!ok) throw new ServiceUnavailableException({ status: 'not-ready', checks });
    return { status: 'ready', checks };
  }

  private async runChecks(): Promise<Record<string, boolean>> {
    const mongoOk = this.mongo.readyState === 1;
    let redisOk = false;
    try {
      redisOk = (await this.redis.ping()) === 'PONG';
    } catch {
      redisOk = false;
    }
    return { mongodb: mongoOk, redis: redisOk };
  }
}
