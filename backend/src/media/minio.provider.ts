import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';

export const MINIO_CLIENT = Symbol('MINIO_CLIENT');

export const minioClientProvider = {
  provide: MINIO_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    new Client({
      endPoint: config.getOrThrow<string>('MINIO_ENDPOINT'),
      port: config.getOrThrow<number>('MINIO_PORT'),
      useSSL: config.getOrThrow<boolean>('MINIO_USE_SSL'),
      accessKey: config.getOrThrow<string>('MINIO_ACCESS_KEY'),
      secretKey: config.getOrThrow<string>('MINIO_SECRET_KEY'),
    }),
};
