import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearDeploymentConnections,
  connectDeploymentProvider,
  deploymentConnections,
  refreshDeploymentConnections,
} from './deploymentConnections';

afterEach(() => {
  vi.unstubAllGlobals();
  clearDeploymentConnections();
});

describe('deployment account state', () => {
  it('ignores a late response from the previous account', async () => {
    let first!: (response: Response) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            first = resolve;
          }),
      )
      .mockResolvedValueOnce(Response.json({ userId: 43, connections: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const previousAccount = refreshDeploymentConnections();
    await refreshDeploymentConnections();
    first(
      Response.json({
        userId: 42,
        connections: [{ kind: 'netlify', maskedToken: 'masked', meta: { email: 'old@test' } }],
      }),
    );
    await previousAccount;

    expect(deploymentConnections.get().userId).toBe(43);
    expect(deploymentConnections.get().connections).toEqual({});
  });

  it('clears connections when signed out and never persists a provider token', async () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem, removeItem: vi.fn() });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            userId: 42,
            connection: { kind: 'netlify', maskedToken: 'masked', meta: { email: 'owner@test' } },
          }),
        )
        .mockResolvedValueOnce(Response.json({ code: 'rayu_auth_required', error: 'Sign in' }, { status: 401 })),
    );

    await connectDeploymentProvider('netlify', 'private-provider-token');
    expect(deploymentConnections.get().connections.netlify?.meta?.email).toBe('owner@test');
    expect(setItem).not.toHaveBeenCalled();
    expect(JSON.stringify(deploymentConnections.get())).not.toContain('private-provider-token');
    await refreshDeploymentConnections();
    expect(deploymentConnections.get().status).toBe('signed-out');
    expect(deploymentConnections.get().connections).toEqual({});
  });
});
