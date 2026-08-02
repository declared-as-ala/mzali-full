import { CommandFactory } from 'nest-commander';
import { CliModule } from './cli/cli.module';

/**
 * Operational CLI (runs inside the worker image):
 *   node dist/cli.js <command>
 * Migration commands (migrate:*) are registered by the migration module.
 */
async function bootstrap() {
  await CommandFactory.run(CliModule, {
    logger: ['error', 'warn', 'log'],
  });
}

void bootstrap();
