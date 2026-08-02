import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type WooQuery = Record<string, string | number | boolean | undefined>;

/**
 * Read-only WooCommerce REST client for the migration. GET only — never
 * writes to WooCommerce. Same auth scheme as the frontend's
 * services/woo/woo-client.ts (HTTP Basic with the consumer key/secret).
 */
@Injectable()
export class WooClientService {
  private readonly logger = new Logger(WooClientService.name);

  constructor(private readonly config: ConfigService) {}

  private base(): string {
    const url = this.config.get<string>('WOO_API_URL');
    if (!url) throw new Error('WOO_API_URL is not configured — required for migration commands');
    return `${url.replace(/\/+$/, '')}/wp-json/wc/v3`;
  }

  private authHeader(): Record<string, string> {
    const key = this.config.get<string>('WOO_CONSUMER_KEY') ?? '';
    const secret = this.config.get<string>('WOO_CONSUMER_SECRET') ?? '';
    if (!key || !secret) throw new Error('WOO_CONSUMER_KEY/WOO_CONSUMER_SECRET are not configured');
    return { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}` };
  }

  private qs(query: WooQuery = {}): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    }
    const s = params.toString();
    return s ? `?${s}` : '';
  }

  /** Single GET with retry on 429/5xx (exponential backoff, 3 attempts). */
  async get<T>(path: string, query: WooQuery = {}): Promise<{ data: T; total: number; totalPages: number }> {
    const url = `${this.base()}${path}${this.qs(query)}`;
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, { headers: this.authHeader() });
        if (res.status === 429 || res.status >= 500) {
          throw new Error(`WC GET ${path} returned ${res.status}`);
        }
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`WC GET ${path} failed: ${res.status} ${text.slice(0, 300)}`);
        }
        const total = Number(res.headers.get('x-wp-total') ?? '0');
        const totalPages = Number(res.headers.get('x-wp-totalpages') ?? '1');
        const data = (await res.json()) as T;
        return { data, total, totalPages };
      } catch (err) {
        lastError = err;
        if (attempt < 3) {
          const delay = 500 * 2 ** (attempt - 1);
          this.logger.warn(`Retrying ${path} (attempt ${attempt} failed: ${String(err)}) in ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    throw lastError;
  }

  /** Paginated iterator — yields each page's items, following x-wp-totalpages. */
  async *paginate<T>(path: string, query: WooQuery = {}, perPage = 100): AsyncGenerator<T[]> {
    let page = 1;
    for (;;) {
      const { data, totalPages } = await this.get<T[]>(path, { ...query, per_page: perPage, page });
      yield data;
      if (page >= totalPages || data.length === 0) break;
      page += 1;
    }
  }
}
