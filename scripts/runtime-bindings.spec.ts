import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { parse } from 'dotenv';
import { hostedBindings, HOSTED_RUNTIME_KEYS, privateWranglerEnvironment } from './runtime-bindings.mjs';

describe('hosted Studio runtime environment', () => {
  it('does not expose user API keys or legacy service tokens to the worker', () => {
    const source =
      'OPENAI_API_KEY=legacy-key\nVITE_GITHUB_ACCESS_TOKEN=legacy-github\nAWS_BEDROCK_CONFIG={"secretAccessKey":"legacy"}\nRAYU_BACKEND_URL=https://api.example.com/api';
    const bindings = hostedBindings([source], { ANTHROPIC_API_KEY: 'legacy-operator-key' });
    expect(bindings).toEqual(['--binding', 'RAYU_BACKEND_URL=https://api.example.com/api']);
    expect(bindings.join(' ')).not.toContain('legacy');
  });
  it('merges base and local files instead of dropping .env when .env.local exists', () => {
    expect(
      hostedBindings([
        'RAYU_BACKEND_URL=https://base.example.com/api',
        'RAYU_STUDIO_SERVER_SECRET="private value with spaces"',
      ]),
    ).toEqual([
      '--binding',
      'RAYU_BACKEND_URL=https://base.example.com/api',
      '--binding',
      'RAYU_STUDIO_SERVER_SECRET=private value with spaces',
    ]);
  });
  it('gives explicit runtime settings precedence without allowing a blank template to mask them', () => {
    expect(
      hostedBindings(['RAYU_STUDIO_SERVER_SECRET='], { RAYU_STUDIO_SERVER_SECRET: 'runtime-only-secret' }),
    ).toEqual(['--binding', 'RAYU_STUDIO_SERVER_SECRET=runtime-only-secret']);
    expect(hostedBindings(['RAYU_STUDIO_SERVER_SECRET=old-file-value'], { RAYU_STUDIO_SERVER_SECRET: '' })).toEqual([]);
  });
  it('accepts quotes and comments without interpreting shell expressions', () => {
    expect(hostedBindings(['RAYU_STUDIO_SERVER_SECRET="literal $(do-not-execute)" # comment'])).toEqual([
      '--binding',
      'RAYU_STUDIO_SERVER_SECRET=literal $(do-not-execute)',
    ]);
  });
  it('keeps build-only browser configuration out of runtime bindings', () => {
    expect(HOSTED_RUNTIME_KEYS).not.toContain('VITE_RAYU_BACKEND_URL');
    expect(HOSTED_RUNTIME_KEYS).not.toContain('VITE_LOG_LEVEL');
    expect(hostedBindings(['VITE_LOG_LEVEL=debug\nVITE_RAYU_BACKEND_URL=https://browser.example.com/api'])).toEqual([]);
  });
  it('preserves optional local-model settings without storing credentials', () => {
    expect(hostedBindings(['OLLAMA_API_BASE_URL=http://127.0.0.1:11434\nDEFAULT_NUM_CTX=32768'])).toContain(
      'DEFAULT_NUM_CTX=32768',
    );
  });
  it('keeps runtime secrets in a private temporary file instead of public CLI bindings', () => {
    const secret = 'test-only-server-value with "quotes" and # symbols';
    const runtime = privateWranglerEnvironment(hostedBindings([], { RAYU_STUDIO_SERVER_SECRET: secret }));
    try {
      expect(statSync(runtime.file).mode & 0o777).toBe(0o600);
      expect(parse(readFileSync(runtime.file)).RAYU_STUDIO_SERVER_SECRET).toBe(secret);
    } finally {
      runtime.cleanup();
      runtime.cleanup();
    }
    expect(existsSync(runtime.file)).toBe(false);
  });
  it('escapes dollar references so Wrangler cannot interpolate the server secret', () => {
    const secret = 'test-only-$NOT_A_VARIABLE-${NOT_A_VARIABLE}-value';
    const runtime = privateWranglerEnvironment(hostedBindings([], { RAYU_STUDIO_SERVER_SECRET: secret }));
    try {
      const parsed = parse(readFileSync(runtime.file)).RAYU_STUDIO_SERVER_SECRET;
      expect(parsed).toContain('\\$NOT_A_VARIABLE');
      expect(parsed.replace(/\\\$/g, '$')).toBe(secret);
    } finally {
      runtime.cleanup();
    }
  });
});
