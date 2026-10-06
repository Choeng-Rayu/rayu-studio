const MAX_BUILD_OUTPUT_CHARS = 4000;

const RAYUCODE_CREDIT =
  '<a data-rayucode-credit href="https://rayucode.com" target="_blank" rel="noopener noreferrer" style="position:fixed;right:12px;bottom:12px;z-index:2147483647;padding:6px 10px;border-radius:8px;background:#161616;color:#fff;font:12px system-ui,sans-serif;text-decoration:none;box-shadow:0 2px 12px #0004">Built by RayuCode</a>';

/** Credit generated static pages without modifying the user's project files. */
export function addRayuCodeCredit(filePath: string, content: string): string {
  if (!/\.html?$/i.test(filePath) || content.includes('data-rayucode-credit')) {
    return content;
  }

  const closingBody = /<\/body\s*>/i;

  if (!closingBody.test(content)) {
    return content;
  }

  return content.replace(closingBody, `${RAYUCODE_CREDIT}</body>`);
}

export function formatBuildFailureOutput(output?: string) {
  const trimmed = output?.trim();

  if (!trimmed) {
    return 'Build failed with no output captured.';
  }

  if (trimmed.length <= MAX_BUILD_OUTPUT_CHARS) {
    return trimmed;
  }

  return `Build output (truncated):\n${trimmed.slice(-MAX_BUILD_OUTPUT_CHARS)}`;
}

/*
 * Deploy uploads used to read every file with `readFile(path, 'utf-8')`. Decoding a
 * PNG, font or .ico as UTF-8 replaces its invalid bytes with U+FFFD, so the deployed
 * site served corrupted images and fonts. Files that are not valid UTF-8 now travel
 * base64-encoded in a separate map and are uploaded as their original bytes.
 */
export type DeployFileContent = { kind: 'text'; content: string } | { kind: 'binary'; base64: string };

// ignoreBOM keeps a leading byte-order mark, so text round-trips byte for byte.
const strictUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** The file as text when it is valid UTF-8 without NUL bytes, otherwise `null`. */
export function decodeTextFile(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) {
    return null;
  }

  try {
    return strictUtf8.decode(bytes);
  } catch {
    return null;
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  // Chunked: spreading a multi-megabyte array into one call overflows the stack.
  const chunkSize = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

/** Read a file for upload without decoding binary content as text. */
export async function readDeployFile(
  fs: { readFile(path: string): Promise<Uint8Array> },
  filePath: string,
): Promise<DeployFileContent> {
  const bytes = await fs.readFile(filePath);
  const text = decodeTextFile(bytes);

  return text === null ? { kind: 'binary', base64: bytesToBase64(bytes) } : { kind: 'text', content: text };
}
