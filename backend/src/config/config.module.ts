import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import { validateEnv } from './env.schema';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      // .env is read from backend/ working dir; real deployments inject env vars
      envFilePath: ['.env.local', '.env'],
    }),
  ],
  exports: [NestConfigModule],
})
export class AppConfigModule {}

export { ConfigService };
