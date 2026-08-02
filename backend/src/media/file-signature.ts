/**
 * Magic-byte detection — never trust a file merely because of its extension
 * or client-reported MIME type. Supports the formats the storefront/admin
 * actually uploads (jpeg, png, webp, gif).
 */
export type DetectedImageType = { mime: string; ext: string } | null;

export function detectImageType(buffer: Buffer): DetectedImageType {
  if (buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  if (
    buffer.toString('ascii', 0, 6) === 'GIF87a' ||
    buffer.toString('ascii', 0, 6) === 'GIF89a'
  ) {
    return { mime: 'image/gif', ext: 'gif' };
  }
  return null;
}
