import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/current-user.decorator';
import { JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { MediaService } from './media.service';

@ApiTags('admin/media')
@ApiBearerAuth()
@Controller('admin/media')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MediaAdminController {
  private readonly logger = new Logger(MediaAdminController.name);
  constructor(private readonly media: MediaService) {}

  @Post()
  @RequirePermissions('media.write')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  async upload(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: RequestUser) {
    if (!file) throw new BadRequestException('Aucun fichier reçu');
    try {
      return await this.media.upload(file.buffer, { createdBy: user.userId });
    } catch (error) {
      this.logger.error({ event: 'media.upload.failed', size: file.size, mime: file.mimetype, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  @Get(':id/download')
  @RequirePermissions('media.read')
  async download(@Param('id') id: string): Promise<StreamableFile> {
    const result = await this.media.getDownloadStream(id);
    if (!result) throw new NotFoundException('Fichier introuvable');
    return new StreamableFile(result.stream, {
      type: result.mime,
      disposition: `inline; filename="${result.filename}"`,
    });
  }

  @Get()
  @RequirePermissions('media.read')
  list(@Query('page') page?: string, @Query('perPage') perPage?: string, @Query('search') search?: string) {
    return this.media.list(page ? Number(page) : undefined, perPage ? Number(perPage) : undefined, search);
  }
}
