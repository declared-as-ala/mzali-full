/**
 * Low-level WooCommerce REST client.
 * Only WooCommerce adapters inside /services/woo/* may import this.
 * UI code MUST NOT touch this file directly.
 */
const BASE = (process.env.WC_API_URL ?? '').replace(/\/$/, '') + '/wp-json/wc/v3';
const KEY = process.env.WC_CONSUMER_KEY ?? '';
const SECRET = process.env.WC_CONSUMER_SECRET ?? '';

function authHeader(): Record<string, string> {
  if (!KEY || !SECRET) return {};
  const token = Buffer.from(`${KEY}:${SECRET}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}

export type WooQuery = Record<string, string | number | boolean | undefined>;

function qs(query: WooQuery = {}): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export type WooFetchResult<T> = { data: T; total: number; totalPages: number };

async function call<T>(method: string, path: string, query: WooQuery = {}, body?: unknown): Promise<WooFetchResult<T>> {
  const url = `${BASE}${path}${qs(query)}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WC ${method} ${path} failed: ${res.status} ${text}`);
  }
  const total = Number(res.headers.get('x-wp-total') ?? '0');
  const totalPages = Number(res.headers.get('x-wp-totalpages') ?? '1');
  const data = (await res.json()) as T;
  return { data, total, totalPages };
}

export const wooClient = {
  get:  <T>(path: string, q?: WooQuery)        => call<T>('GET', path, q),
  post: <T>(path: string, body: unknown)        => call<T>('POST', path, {}, body),
  put:  <T>(path: string, body: unknown)        => call<T>('PUT', path, {}, body),
  del:  <T>(path: string)                       => call<T>('DELETE', path, { force: true }),
  trash: <T>(path: string)                      => call<T>('DELETE', path, { force: false }),
};
