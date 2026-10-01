import { describe, expect, it } from 'vitest';
import { DEFAULT_PROVIDER, PROVIDER_LIST, STARTER_TEMPLATES } from './constants';

describe('Rayu provider defaults', () => {
  it('defaults to account auth while keeping the API-key choice first', () => {
    expect(DEFAULT_PROVIDER.name).toBe('Rayu');
    expect(PROVIDER_LIST[0]?.name).toBe('Rayu API Key');
    expect(PROVIDER_LIST.some((provider) => provider.name === 'Rayu')).toBe(true);
  });
});

describe('starter templates', () => {
  it('names every template repository as owner/repo', () => {
    /*
     * `/api/github-template` passes this straight to `api.github.com/repos/<repo>`; a
     * bare repo name 404s and the import silently falls back to a blank project.
     */
    for (const template of STARTER_TEMPLATES) {
      expect(template.githubRepo, template.name).toMatch(/^[\w.-]+\/[\w.-]+$/);
    }
  });
});
