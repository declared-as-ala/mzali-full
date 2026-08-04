import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { isValidObjectId, Model } from 'mongoose';
import type { Client } from 'minio';
import sharp from 'sharp';
import { clampPagination, paginate } from '@/common/pagination';
import { detectImageType } from './file-signature';
import { Media, MediaDocument } from './media.schema';
import { MINIO_CLIENT } from './minio.provider';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB — matches the legacy WP upload cap
const DEFAULT_BUCKET = 'catalog';

export type UploadResult = {
  id: string;
  url: string;
  variants: { name: string; url: string; width: number; height: number }[];
};

@Injectable()
export class MediaService {
  constructor(
    @InjectModel(Media.name) private readonly model: Model<Media>,
    @Inject(MINIO_CLIENT) private readonly minio: Client,
    private readonly config: ConfigService,
  ) {}

  async upload(
    buffer: Buffer,
    opts: { alt?: string; bucket?: string; createdBy?: string | null; originalUrl?: string },
  ): Promise<UploadResult> {
    if (buffer.length === 0) throw new BadRequestException('Fichier vide');
    if (buffer.length > MAX_UPLOAD_BYTES) throw new BadRequestException('Fichier trop volumineux (8 Mo max)');

    const detected = detectImageType(buffer);
    if (!detected) throw new BadRequestException('Type de fichier non pris en charge');

    const checksum = createHash('sha256').update(buffer).digest('hex');
    const existing = await this.model.findOne({ checksum });
    if (existing) {
      // Same bytes uploaded again from a different legacy URL — record the
      // additional origin so migrate:products can still resolve by URL.
      if (opts.originalUrl && !existing.originalUrl) {
        existing.originalUrl = opts.originalUrl;
        await existing.save();
      }
      return this.toUploadResult(existing);
    }

    const bucket = opts.bucket ?? DEFAULT_BUCKET;
    const meta = await sharp(buffer).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;

    const objectKey = `${randomUUID()}.${detected.ext}`;
    await this.minio.putObject(bucket, objectKey, buffer, buffer.length, { 'Content-Type': detected.mime });

    const variants = await this.buildVariants(buffer, bucket);

    const doc = await this.model.create({
      bucket,
      objectKey,
      mime: detected.mime,
      size: buffer.length,
      checksum,
      width,
      height,
      alt: opts.alt ?? '',
      variants,
      createdBy: opts.createdBy ?? null,
      originalUrl: opts.originalUrl ?? null,
    });
    return this.toUploadResult(doc);
  }

  /**
   * Non-image files (generated PDFs, supplier attachments) — skips
   * detectImageType/sharp entirely, no thumbnail variants. Same dedupe-
   * by-checksum behavior as upload().
   */
  async uploadDocument(
    buffer: Buffer,
    opts: { mime: string; filename: string; bucket?: string; createdBy?: string | null },
  ): Promise<UploadResult> {
    if (buffer.length === 0) throw new BadRequestException('Fichier vide');
    if (buffer.length > MAX_UPLOAD_BYTES) throw new BadRequestException('Fichier trop volumineux (8 Mo max)');

    const checksum = createHash('sha256').update(buffer).digest('hex');
    const existing = await this.model.findOne({ checksum });
    if (existing) return this.toUploadResult(existing);

    const bucket = opts.bucket ?? 'documents';
    const ext = opts.filename.includes('.') ? opts.filename.split('.').pop() : 'bin';
    const objectKey = `${randomUUID()}.${ext}`;
    await this.minio.putObject(bucket, objectKey, buffer, buffer.length, { 'Content-Type': opts.mime });

    const doc = await this.model.create({
      bucket,
      objectKey,
      mime: opts.mime,
      size: buffer.length,
      checksum,
      width: 0,
      height: 0,
      alt: opts.filename,
      variants: [],
      createdBy: opts.createdBy ?? null,
    });
    return this.toUploadResult(doc);
  }

  /** Authenticated streaming download — for private buckets like `documents` that aren't publicly readable in MinIO. */
  async getDownloadStream(id: string): Promise<{ stream: Readable; mime: string; filename: string } | null> {
    const doc = await this.model.findById(id).catch(() => null);
    if (!doc) return null;
    const stream = await this.minio.getObject(doc.bucket, doc.objectKey);
    return { stream, mime: doc.mime, filename: doc.alt || doc.objectKey };
  }

  /**
   * Resolves media document ids (e.g. a product's imageIds) to their real
   * public URLs — never store/return the bare id as a url; that isn't a
   * fetchable path and any <img src> using it 404s against whatever page
   * it's rendered on. Invalid/unknown ids are simply absent from the map.
   */
  async getUrlsByIds(ids: string[]): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(ids)].filter((id) => isValidObjectId(id));
    if (!uniqueIds.length) return new Map();
    const docs = await this.model.find({ _id: { $in: uniqueIds } }).select({ bucket: 1, objectKey: 1 });
    const base = this.config.getOrThrow<string>('MINIO_PUBLIC_URL').replace(/\/$/, '');
    return new Map(docs.map((doc) => [doc.id, `${base}/${doc.bucket}/${doc.objectKey}`]));
  }

  async list(page?: number, perPage?: number, search?: string) {
    const { page: p, perPage: pp, skip } = clampPagination(page, perPage, 100);
    const filter = search ? { alt: { $regex: search, $options: 'i' } } : {};
    const [docs, total] = await Promise.all([
      this.model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pp),
      this.model.countDocuments(filter),
    ]);
    return paginate(docs.map((d) => this.toUploadResult(d)), total, p, pp);
  }

  private async buildVariants(
    buffer: Buffer,
    bucket: string,
  ): Promise<{ name: 'thumb' | 'md'; objectKey: string; width: number; height: number; size: number }[]> {
    const specs: { name: 'thumb' | 'md'; maxSize: number }[] = [
      { name: 'thumb', maxSize: 400 },
      { name: 'md', maxSize: 1200 },
    ];
    const results: { name: 'thumb' | 'md'; objectKey: string; width: number; height: number; size: number }[] = [];
    for (const spec of specs) {
      const resized = await sharp(buffer)
        .resize({ width: spec.maxSize, height: spec.maxSize, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
      const objectKey = `${randomUUID()}-${spec.name}.webp`;
      await this.minio.putObject(bucket, objectKey, resized.data, resized.data.length, {
        'Content-Type': 'image/webp',
      });
      results.push({
        name: spec.name,
        objectKey,
        width: resized.info.width,
        height: resized.info.height,
        size: resized.data.length,
      });
    }
    return results;
  }

  private toUploadResult(doc: MediaDocument): UploadResult {
    const base = this.config.getOrThrow<string>('MINIO_PUBLIC_URL').replace(/\/$/, '');
    return {
      id: doc.id,
      url: `${base}/${doc.bucket}/${doc.objectKey}`,
      variants: doc.variants.map((v) => ({
        name: v.name,
        url: `${base}/${doc.bucket}/${v.objectKey}`,
        width: v.width,
        height: v.height,
      })),
    };
  }
}
