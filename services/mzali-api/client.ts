import 'server-only';

/**
 * Thin fetch wrapper for the NestJS backend. Server-only (BFF pattern) —
 * the browser never calls this API directly.
 */
const BASE = (process.env.MZALI_API_URL ?? '').replace(/\/+$/, '');
const SERVICE_TOKEN = process.env.MZALI_SERVICE_TOKEN ?? '';

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  bearer?: string;
  serviceToken?: boolean;
  idempotencyKey?: string;
  query?: Record<string, string | number | boolean | undefined | null>;
};

function qs(query?: RequestOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  if (!BASE) throw new Error('MZALI_API_URL is not configured');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.serviceToken) headers['X-Service-Token'] = SERVICE_TOKEN;
  if (opts.bearer) headers.Authorization = `Bearer ${opts.bearer}`;
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  const res = await fetch(`${BASE}/api/v1${path}${qs(opts.query)}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let json: unknown = undefined;
  if (text) {
    try { json = JSON.parse(text); } catch { /* non-JSON body */ }
  }

  if (!res.ok) {
    const message =
      (json && typeof json === 'object' && 'message' in json && typeof (json as { message: unknown }).message === 'string'
        ? (json as { message: string }).message
        : undefined) ?? `Request failed (${res.status})`;
    throw new ApiError(Array.isArray(message) ? message.join(', ') : message, res.status);
  }
  return json as T;
}

/** Multipart upload passthrough (media). */
export async function apiUpload<T>(path: string, form: FormData, bearer: string): Promise<T> {
  if (!BASE) throw new Error('MZALI_API_URL is not configured');
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearer}` },
    body: form,
    cache: 'no-store',
  });
  const text = await res.text();
  let json: unknown = undefined;
  if (text) {
    try { json = JSON.parse(text); } catch { /* ignore */ }
  }
  if (!res.ok) {
    const message =
      (json && typeof json === 'object' && 'message' in json ? String((json as { message: unknown }).message) : undefined) ??
      `Upload failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return json as T;
}
