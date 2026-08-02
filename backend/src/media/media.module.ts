import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MediaAdminController } from './media-admin.controller';
import { Media, MediaSchema } from './media.schema';
import { MediaService } from './media.service';
import { minioClientProvider } from './minio.provider';

@Module({
  imports: [MongooseModule.forFeature([{ name: Media.name, schema: MediaSchema }])],
  controllers: [MediaAdminController],
  providers: [MediaService, minioClientProvider],
  exports: [MediaService, minioClientProvider],
})
export class MediaModule {}
