import { describe, expect, it } from 'vitest';
import { DEFAULT_PROVIDER, PROVIDER_LIST } from './constants';

describe('Rayu provider defaults', () => {
  it('defaults to account auth while keeping the API-key choice first', () => {
    expect(DEFAULT_PROVIDER.name).toBe('Rayu');
    expect(PROVIDER_LIST[0]?.name).toBe('Rayu API Key');
    expect(PROVIDER_LIST.some((provider) => provider.name === 'Rayu')).toBe(true);
  });
});
