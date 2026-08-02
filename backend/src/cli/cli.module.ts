import { Module } from '@nestjs/common';
import { AppConfigModule } from '@/config/config.module';
import { DatabaseModule } from '@/database/database.module';
import { RedisModule } from '@/redis/redis.module';
import { AuditModule } from '@/audit/audit.module';
import { MigrationModule } from '@/migration/migration.module';
import { VerifyConfigCommand } from './verify-config.command';

@Module({
  imports: [AppConfigModule, DatabaseModule, RedisModule, AuditModule, MigrationModule],
  providers: [VerifyConfigCommand],
})
export class CliModule {}
