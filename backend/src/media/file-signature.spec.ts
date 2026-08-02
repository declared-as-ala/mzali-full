import { detectImageType } from './file-signature';

function bytes(...values: number[]): Buffer {
  const buf = Buffer.alloc(20);
  values.forEach((v, i) => (buf[i] = v));
  return buf;
}

describe('detectImageType', () => {
  it('detects jpeg by magic bytes', () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toEqual({ mime: 'image/jpeg', ext: 'jpg' });
  });

  it('detects png by magic bytes', () => {
    expect(
      detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)),
    ).toEqual({ mime: 'image/png', ext: 'png' });
  });

  it('detects webp by RIFF....WEBP container', () => {
    const buf = Buffer.alloc(20);
    buf.write('RIFF', 0, 'ascii');
    buf.write('WEBP', 8, 'ascii');
    expect(detectImageType(buf)).toEqual({ mime: 'image/webp', ext: 'webp' });
  });

  it('detects gif89a', () => {
    const buf = Buffer.alloc(20);
    buf.write('GIF89a', 0, 'ascii');
    expect(detectImageType(buf)).toEqual({ mime: 'image/gif', ext: 'gif' });
  });

  it('rejects a renamed non-image file (e.g. a script with a .jpg extension)', () => {
    const buf = Buffer.from('#!/bin/sh\necho pwned\n'.padEnd(20, ' '), 'ascii');
    expect(detectImageType(buf)).toBeNull();
  });

  it('rejects buffers too short to contain a signature', () => {
    expect(detectImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});
