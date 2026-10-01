import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64, decodeTextFile, readDeployFile } from './deployUtils';

// First bytes of a real PNG: 0x89 is not a valid UTF-8 lead byte.
const PNG_HEADER = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

describe('deploy file encoding', () => {
  it('keeps UTF-8 source and markup as text, including multi-byte characters and a BOM', () => {
    const html = '\uFEFF<p>© Rayu — 日本語</p>';

    expect(decodeTextFile(new TextEncoder().encode(html))).toBe(html);
  });

  it('treats invalid UTF-8 or NUL bytes as binary', () => {
    expect(decodeTextFile(PNG_HEADER)).toBeNull();
    expect(decodeTextFile(Uint8Array.from([0x61, 0x00, 0x62]))).toBeNull();
  });

  it('round-trips binary files through base64 byte for byte, also past the chunk size', () => {
    const large = new Uint8Array(100_000).map((_value, index) => (index * 31) % 256);

    expect(bytesToBase64(large)).toBe(Buffer.from(large).toString('base64'));
    expect(base64ToBytes(bytesToBase64(large))).toEqual(large);
  });

  it('reads binary files as base64 instead of decoding them as text', async () => {
    const fakeFs = {
      readFile: async (path: string) => (path.endsWith('.png') ? PNG_HEADER : new TextEncoder().encode('body{}')),
    };

    expect(await readDeployFile(fakeFs, '/dist/logo.png')).toEqual({
      kind: 'binary',
      base64: Buffer.from(PNG_HEADER).toString('base64'),
    });
    expect(await readDeployFile(fakeFs, '/dist/app.css')).toEqual({ kind: 'text', content: 'body{}' });
  });
});
