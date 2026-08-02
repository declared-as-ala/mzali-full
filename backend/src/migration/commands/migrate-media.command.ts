import { Command, CommandRunner, Option } from 'nest-commander';
import { MediaService } from '@/media/media.service';
import { checksumOf } from '../checksum';
import { LegacyMappingService } from '../legacy-mapping.service';
import { writeReport } from '../report-writer';
import { WooCategoryRaw, WooProductRaw } from '../woo-types';
import { WooClientService } from '../woo-client.service';

type Options = { dryRun?: boolean; since?: string; limit?: number };

const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;

@Command({ name: 'migrate:media', description: 'Download WooCommerce product/category images into MinIO' })
export class MigrateMediaCommand extends CommandRunner {
  constructor(
    private readonly woo: WooClientService,
    private readonly mappings: LegacyMappingService,
    private readonly mediaService: MediaService,
  ) {
    super();
  }

  @Option({ flags: '--dry-run', description: 'Report only, download nothing' })
  parseDryRun(): boolean {
    return true;
  }
  @Option({ flags: '--since <iso>', description: 'Only entities modified since this ISO timestamp' })
  parseSince(val: string): string {
    return val;
  }
  @Option({ flags: '--limit <n>', description: 'Stop after this many URLs' })
  parseLimit(val: string): number {
    return Number(val);
  }
  @Option({ flags: '--report', description: 'Print the failed-image list from the most recent run' })
  parseReportOnly(): boolean {
    return true;
  }

  async run(_params: string[], options: Options & { report?: boolean }): Promise<void> {
    if (options.report) {
      const failed = await this.mappings.failedEntries('media');
      console.log(`${failed.length} previously failed media URLs:`);
      for (const f of failed) console.log(`  ${f.legacyId} — ${f.error}`);
      return;
    }

    const urls = await this.collectImageUrls(options.since);
    const report = { total: urls.size, downloaded: 0, deduped: 0, skipped: 0, failed: 0, errors: [] as { url: string; error: string }[] };
    let count = 0;

    for (const url of urls) {
      if (options.limit && count >= options.limit) break;
      count += 1;
      const checksum = checksumOf(url);
      const resolution = await this.mappings.resolve('woocommerce', 'media', url, checksum);
      if (resolution.action === 'skip') {
        report.skipped += 1;
        continue;
      }
      if (options.dryRun) continue;

      try {
        const buffer = await this.download(url);
        const result = await this.mediaService.upload(buffer, { bucket: 'catalog', originalUrl: url });
        await this.mappings.recordMigrated('woocommerce', 'media', url, result.id, checksum);
        report.downloaded += 1;
      } catch (err) {
        report.failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        report.errors.push({ url, error: message });
        await this.mappings.recordFailed('woocommerce', 'media', url, checksum, message);
      }
    }

    const path = await writeReport('migrate-media', { options, report });
    console.log(`migrate:media — total=${report.total} downloaded=${report.downloaded} skipped=${report.skipped} failed=${report.failed}`);
    if (report.failed > 0) console.log(`Run with --report to list failed URLs. Report: ${path}`);
    else console.log(`Report: ${path}`);
  }

  private async download(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) throw new Error(`Unexpected content-type: ${contentType}`);
    const contentLength = Number(res.headers.get('content-length') ?? '0');
    if (contentLength > MAX_DOWNLOAD_BYTES) throw new Error(`File too large: ${contentLength} bytes`);
    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_DOWNLOAD_BYTES) throw new Error(`File too large: ${arrayBuffer.byteLength} bytes`);
    return Buffer.from(arrayBuffer);
  }

  private async collectImageUrls(since?: string): Promise<Set<string>> {
    const urls = new Set<string>();
    for await (const page of this.woo.paginate<WooCategoryRaw>('/products/categories', { modified_after: since })) {
      for (const c of page) if (c.image?.src) urls.add(c.image.src);
    }
    for await (const page of this.woo.paginate<WooProductRaw>('/products', { modified_after: since })) {
      for (const p of page) for (const img of p.images ?? []) if (img.src) urls.add(img.src);
    }
    return urls;
  }
}
