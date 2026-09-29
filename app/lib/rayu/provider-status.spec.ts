import { describe, expect, it } from 'vitest';
import { classifyRayuProvider } from './provider-status';

describe('Rayu provider availability', () => {
  it('separates sign-in, gateway failures, and available models', () => {
    expect(classifyRayuProvider({ signedIn: false, hasModels: false, catalogFailed: false })).toBe('sign-in-required');
    expect(classifyRayuProvider({ signedIn: true, hasModels: false, catalogFailed: true })).toBe('unavailable');
    expect(
      classifyRayuProvider({
        signedIn: true,
        hasModels: true,
        catalogFailed: false,
        entitlements: { allowedModels: [{}] },
      }),
    ).toBe('ready');
  });

  it('gates only an unfunded Free account with hosted models available', () => {
    expect(
      classifyRayuProvider({
        signedIn: true,
        hasModels: true,
        catalogFailed: false,
        entitlements: { plan: { code: 'free' }, allowedModels: [], hostedModels: [{}] },
      }),
    ).toBe('upgrade-required');
    expect(
      classifyRayuProvider({
        signedIn: true,
        hasModels: true,
        catalogFailed: false,
        entitlements: { plan: { code: 'basic' }, allowedModels: [], hostedModels: [{}] },
      }),
    ).toBe('unavailable');
    expect(
      classifyRayuProvider({
        signedIn: true,
        hasModels: true,
        catalogFailed: false,
        entitlements: { plan: { code: 'free' }, allowedModels: [{}], hostedModels: [{}], topupBalance: 10 },
      }),
    ).toBe('ready');
  });

  it('reports missing catalog configuration separately', () => {
    expect(
      classifyRayuProvider({
        signedIn: true,
        hasModels: false,
        catalogFailed: false,
        entitlements: { plan: { code: 'free' }, allowedModels: [], hostedModels: [] },
      }),
    ).toBe('no-models-configured');
  });
});
