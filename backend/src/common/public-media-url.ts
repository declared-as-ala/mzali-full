const PUBLIC_MEDIA_PATH = /^\/(?:catalog|categories|banners)(?:\/|$)/i;

/**
 * Repoints legacy MinIO URLs (for example localhost:9002/catalog/...) to the
 * browser-facing media origin. Product records intentionally keep their
 * original object path, so changing the deployment host does not require a
 * database migration.
 */
export function normalizePublicMediaUrl(value: string, configuredBase?: string): string;
export function normalizePublicMediaUrl(value: string | null, configuredBase?: string): string | null;
export function normalizePublicMediaUrl(
  value: string | null,
  configuredBase = process.env.MINIO_PUBLIC_URL,
): string | null {
  if (!value || !configuredBase) return value;

  const base = configuredBase.replace(/\/+$/, '');
  if (!base) return value;

  try {
    const parsed = new URL(value, 'http://relative-media.local');
    if (!PUBLIC_MEDIA_PATH.test(parsed.pathname)) return value;
    return `${base}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return value;
  }
}
