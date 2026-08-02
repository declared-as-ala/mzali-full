import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';

/**
 * Worker process entry — application context only (no HTTP listener).
 * Container health is probed via `node dist/worker-probe.js`.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  new Logger('Worker').log('Worker started — queue processors registered');
}

void bootstrap();
