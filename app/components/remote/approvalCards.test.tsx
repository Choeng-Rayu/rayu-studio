/**
 * Approval cards in the browser — what a click can and cannot answer.
 *
 * Renders the real cards against the real store; only the socket client is stubbed, so
 * an "answer" here is the frame the store would have emitted.
 *
 * NODE ENVIRONMENT, WITH VITEST'S OWN JSDOM ENVIRONMENT INSTALLED BY HAND, deliberately.
 * In the jsdom test environment modules are transformed for the browser, and the Remix
 * Vite plugin's React Refresh transform then injects a preamble check into every .tsx
 * module that throws outside a dev server ("Remix Vite plugin can't detect preamble").
 * The node environment uses the SSR transform, which skips it (@remix-run/dev
 * vite/plugin.js: `useFastRefresh = !ssr && ...`). Do not name the environment pragma in
 * this comment: Vitest reads it from the first docblock. react-dom is imported only after
 * the DOM globals exist, because it decides at load time whether it can use the DOM.
 * Testing Library is not used: its `@testing-library/dom` peer is not installed here.
 */

import { act } from 'react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { builtinEnvironments } from 'vitest/environments';

const domEnvironment = await builtinEnvironments.jsdom.setup(globalThis, {});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { createRoot } = await import('react-dom/client');
type Root = ReturnType<typeof createRoot>;

const handlers = new Map<string, (payload: unknown) => void>();
const client = vi.hoisted(() => ({
  connected: true,
  connect: vi.fn(async () => undefined),
  disconnect: vi.fn(),
  onLifecycle: vi.fn(() => () => undefined),
  toolDecision: vi.fn(() => true),
  planDecision: vi.fn(() => true),
  questionAnswer: vi.fn(() => true),
}));
const getAccessToken = vi.hoisted(() => vi.fn(async (): Promise<string | null> => 'studio-account-token'));
vi.mock('../../lib/rayu-auth.client', () => ({
  loadRayuUser: vi.fn(async () => ({ id: 7, email: 'owner@example.test', displayName: null, avatarUrl: null })),
  startRayuSignIn: vi.fn(async () => undefined),
}));
vi.mock('../../lib/stores/deploymentConnections', () => ({ clearDeploymentConnections: vi.fn() }));
vi.mock('./RemoteChat', () => ({ RemoteChat: () => null }));
vi.mock('@remix-run/react', async (original) => ({
  ...(await original<typeof import('@remix-run/react')>()),
  useSearchParams: () => [new URLSearchParams(window.location.search), () => undefined],
}));

vi.mock('../../lib/rayu/session', () => ({ getAccessToken }));

vi.mock('../../lib/webBridge/webBridgeClient', () => ({
  webBridgeClient: {
    ...client,
    on: (event: string, listener: (payload: unknown) => void) => {
      handlers.set(event, listener);
      return () => handlers.delete(event);
    },
  },
}));
vi.mock('react-toastify', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));

const store = await import('../../lib/webBridge/webBridgeStore');
const { BRIDGE_EVENT } = await import('../../lib/webBridge/webBridgeTypes');
const { ToolApprovalCard } = await import('./ToolApprovalCard');
const { PlanApprovalCard } = await import('./PlanApprovalCard');
const { PairWorkerCard } = await import('./PairWorkerCard');
const { SessionPicker } = await import('./SessionPicker');
const { APPROVAL_ARM_DELAY_MS } = await import('./useArmed');

/*
 * A Vite query lets the node test render the real browser-only components while
 * preserving Remix's .client boundary in production (the plugin matches file suffixes).
 */
const remotePageSource = './RemotePage.client?test';
const authControlSource = '../header/StudioAuthControl.client?test';
const { RemotePage } = (await import(remotePageSource)) as typeof import('./RemotePage.client');
const { StudioAuthControl } = (await import(authControlSource)) as typeof import('../header/StudioAuthControl.client');

let container: HTMLDivElement;
let root: Root;

function emit(event: string, payload: unknown): void {
  act(() => handlers.get(event)?.(payload));
}

function toolCall(callId: string) {
  return { sessionId: 'A', callId, toolName: 'Bash', toolInput: { command: 'ls' } };
}

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(label));

  if (!found) {
    throw new Error(`no button labelled "${label}"`);
  }

  return found;
}

function checkbox(): HTMLInputElement {
  return container.querySelector('input[type="checkbox"]') as HTMLInputElement;
}

const arm = () => act(() => vi.advanceTimersByTime(APPROVAL_ARM_DELAY_MS));

beforeEach(async () => {
  // Only timeouts: React's own scheduling must keep running between `act` calls.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.clearAllMocks();
  getAccessToken.mockResolvedValue('studio-account-token');
  window.history.replaceState(null, '', '/remote');
  await store.startWebBridge();
  emit(BRIDGE_EVENT.SESSION_LIST, [
    {
      id: 'A',
      machineId: 'm_A',
      hostname: 'box',
      cwd: '/app',
      sessionLabel: null,
      pid: 1,
      isAttached: true,
      status: 'live',
      lastSeenAt: new Date().toISOString(),
    },
  ]);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  store.stopWebBridge();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  // Leave no DOM behind for whatever this worker runs next.
  await domEnvironment.teardown(globalThis);
});

describe('ToolApprovalCard', () => {
  it('ignores clicks until the card has been on screen briefly', () => {
    emit(BRIDGE_EVENT.TOOL_CALL, toolCall('c1'));
    act(() => root.render(<ToolApprovalCard />));

    act(() => button('Allow').click());
    expect(client.toolDecision).not.toHaveBeenCalled();

    arm();
    act(() => button('Allow').click());
    expect(client.toolDecision).toHaveBeenCalledWith('c1', 'allow', expect.anything());
  });

  it('a double-click answers only the request that was on screen', () => {
    emit(BRIDGE_EVENT.TOOL_CALL, toolCall('c1'));
    emit(BRIDGE_EVENT.TOOL_CALL, toolCall('c2'));
    act(() => root.render(<ToolApprovalCard />));
    arm();

    act(() => button('Allow').click());
    act(() => button('Allow').click());

    expect(client.toolDecision).toHaveBeenCalledTimes(1);
    expect(client.toolDecision).toHaveBeenCalledWith('c1', 'allow', expect.anything());
    expect(store.pendingToolCall.get()?.callId).toBe('c2');
  });

  it('starts every request with "Don\u2019t ask again" unticked', () => {
    emit(BRIDGE_EVENT.TOOL_CALL, toolCall('c1'));
    emit(BRIDGE_EVENT.TOOL_CALL, toolCall('c2'));
    act(() => root.render(<ToolApprovalCard />));
    arm();

    act(() => checkbox().click());
    expect(checkbox().checked).toBe(true);
    act(() => button('Allow').click());

    expect(client.toolDecision).toHaveBeenCalledWith('c1', 'allow', expect.objectContaining({ remember: true }));
    expect(checkbox().checked).toBe(false);
  });
});

describe('PlanApprovalCard', () => {
  it('states the permission mode each approval leads to', () => {
    emit(BRIDGE_EVENT.PLAN_REQUEST, { sessionId: 'A', callId: 'p1', plan: '1. Ship it' });
    act(() => root.render(<PlanApprovalCard />));

    expect(button('Approve · Orchestrator').textContent).toMatch(/run without asking/);
    expect(button('Approve · auto-accept edits').textContent).toMatch(/commands still ask/);
  });

  it('sends the chosen approval for the plan that was shown', () => {
    emit(BRIDGE_EVENT.PLAN_REQUEST, { sessionId: 'A', callId: 'p1', plan: '1. Ship it' });
    act(() => root.render(<PlanApprovalCard />));
    arm();

    act(() => button('Approve · auto-accept edits').click());

    expect(client.planDecision).toHaveBeenCalledWith('p1', true, { acceptEdits: true });
    expect(store.pendingPlanRequest.get()).toBeNull();
  });
});

describe('QR pairing', () => {
  it('cancels an approval lookup immediately when Studio signs out', async () => {
    const request = vi.fn(async () => Response.json({ hostname: 'host', cwd: '/work' }));
    vi.stubGlobal('fetch', request);
    await act(async () => root.render(<PairWorkerCard pairingChallenge={'a'.repeat(32)} />));
    arm();

    const credentials = Promise.withResolvers<string>();
    getAccessToken.mockReturnValueOnce(credentials.promise);
    act(() => button('Approve machine').click());
    act(() => window.dispatchEvent(new Event('rayu-auth-signout')));
    await act(async () => {
      credentials.resolve('late-token');
      await credentials.promise;
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(button('Approve machine').disabled).toBe(true);
  });
  it.each([true, false])('shows both connection options when the machine list is empty: %s', (empty) => {
    if (empty) {
      emit(BRIDGE_EVENT.SESSION_LIST, []);
    }

    act(() => root.render(<SessionPicker />));

    expect(container.textContent).toContain('Connect a machine');
    expect(container.textContent).toContain('/web-bridge pair');
    expect(container.textContent).toContain('QR code');
    expect(container.textContent).toContain('same Rayu account');
    expect(container.querySelector('details')?.open).toBe(empty);
  });

  it('previews the scanned worker and approves only after an explicit click', async () => {
    const challenge = 'challenge_abcdefghijklmnopqrstuvwxyz123456';
    window.history.replaceState(null, '', `/remote?pair=${challenge}`);

    const request = vi.fn(async (_input: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? new Response(null, { status: 201 })
        : Response.json({ hostname: 'trusted-host', cwd: '/work', sessionLabel: 'rayu CLI — work' }),
    );
    vi.stubGlobal('fetch', request);
    await act(async () => root.render(<PairWorkerCard />));

    expect(container.textContent).toContain('trusted-host');
    expect(container.textContent).toContain('/work');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toContain(`/preview/${challenge}`);
    arm();
    expect(button('Approve machine').disabled).toBe(false);

    await act(async () => button('Approve machine').click());

    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][1]).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer studio-account-token' },
      body: JSON.stringify({ challenge }),
    });
    expect(window.location.search).toBe('');
    expect(container.textContent).toContain('Approved.');
  });

  it('dismisses a QR preview without approving the worker', async () => {
    window.history.replaceState(null, '', '/remote?pair=challenge_abcdefghijklmnopqrstuvwxyz123456');

    const request = vi.fn(async () => Response.json({ hostname: 'trusted-host', cwd: '/work' }));
    vi.stubGlobal('fetch', request);
    await act(async () => root.render(<PairWorkerCard />));

    act(() => button('Cancel').click());

    expect(request).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('');
    expect(container.textContent).toBe('');
  });

  it('keeps approval disabled for an expired QR and points to the explicit pairing command', async () => {
    window.history.replaceState(null, '', '/remote?pair=challenge_abcdefghijklmnopqrstuvwxyz123456');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    await act(async () => root.render(<PairWorkerCard />));

    expect(button('Approve machine').disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('/web-bridge pair');
  });

  it('requires a Studio sign-in before previewing or approving', async () => {
    window.history.replaceState(null, '', '/remote?pair=challenge_abcdefghijklmnopqrstuvwxyz123456');
    getAccessToken.mockResolvedValue(null);

    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    await act(async () => root.render(<PairWorkerCard />));

    expect(request).not.toHaveBeenCalled();
    expect(button('Approve machine').disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Sign in');
  });

  it('does not report approval when the QR expires after the preview', async () => {
    window.history.replaceState(null, '', '/remote?pair=challenge_abcdefghijklmnopqrstuvwxyz123456');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string, init?: RequestInit) =>
        init?.method === 'POST'
          ? new Response(null, { status: 400 })
          : Response.json({ hostname: 'trusted-host', cwd: '/work' }),
      ),
    );
    await act(async () => root.render(<PairWorkerCard />));
    arm();
    await act(async () => button('Approve machine').click());

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('/web-bridge pair');
    expect(container.textContent).not.toContain('Approved.');
    expect(window.location.search).toContain('pair=');
  });

  it('ignores a double click while approval credentials are loading', async () => {
    window.history.replaceState(null, '', '/remote?pair=challenge_abcdefghijklmnopqrstuvwxyz123456');

    const request = vi.fn(async (_input: string, init?: RequestInit) =>
      init?.method === 'POST' ? new Response(null, { status: 201 }) : Response.json({ hostname: 'host', cwd: '/work' }),
    );
    vi.stubGlobal('fetch', request);
    await act(async () => root.render(<PairWorkerCard />));
    arm();

    const credentials = Promise.withResolvers<string>();
    getAccessToken.mockReturnValueOnce(credentials.promise);

    act(() => {
      button('Approve machine').click();
      button('Approve machine').click();
    });
    expect(button('Cancel').disabled).toBe(true);
    await act(async () => {
      credentials.resolve('studio-account-token');
      await credentials.promise;
    });

    expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it('does not approve after the card unmounts while credentials are loading', async () => {
    window.history.replaceState(null, '', '/remote?pair=challenge_abcdefghijklmnopqrstuvwxyz123456');

    const request = vi.fn(async () => Response.json({ hostname: 'host', cwd: '/work' }));
    vi.stubGlobal('fetch', request);
    await act(async () => root.render(<PairWorkerCard />));
    arm();

    const credentials = Promise.withResolvers<string>();
    getAccessToken.mockReturnValueOnce(credentials.promise);
    act(() => button('Approve machine').click());
    act(() => root.render(null));
    await act(async () => {
      credentials.resolve('studio-account-token');
      await credentials.promise;
    });

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not fetch details after a preview was dismissed during sign-in lookup', async () => {
    window.history.replaceState(null, '', '/remote?pair=challenge_abcdefghijklmnopqrstuvwxyz123456');

    const credentials = Promise.withResolvers<string>();
    getAccessToken.mockReturnValueOnce(credentials.promise);

    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    await act(async () => root.render(<PairWorkerCard />));
    act(() => button('Cancel').click());
    await act(async () => {
      credentials.resolve('studio-account-token');
      await credentials.promise;
    });

    expect(request).not.toHaveBeenCalled();
  });

  it('reloads and rearms the review when another QR link opens on the same page', async () => {
    const request = vi.fn(async (_input: string) => Response.json({ hostname: 'host', cwd: '/work' }));
    vi.stubGlobal('fetch', request);
    await act(async () => root.render(<PairWorkerCard pairingChallenge={'a'.repeat(32)} />));
    arm();
    expect(button('Approve machine').disabled).toBe(false);
    await act(async () => root.render(<PairWorkerCard pairingChallenge={'b'.repeat(32)} />));

    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0]).toContain('b'.repeat(32));
    expect(button('Approve machine').disabled).toBe(true);
  });

  it('refuses malformed QR challenges before contacting the backend', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    await act(async () => root.render(<PairWorkerCard pairingChallenge="not-a-challenge" />));

    expect(request).not.toHaveBeenCalled();
    expect(button('Approve machine').disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('invalid');
  });

  it('retries a temporary preview failure without requiring another QR code', async () => {
    getAccessToken.mockRejectedValueOnce(new Error('Sign-in temporarily unavailable'));

    const request = vi.fn(async () => Response.json({ hostname: 'host', cwd: '/work' }));
    vi.stubGlobal('fetch', request);
    await act(async () => root.render(<PairWorkerCard pairingChallenge={'a'.repeat(32)} />));

    expect(request).not.toHaveBeenCalled();
    await act(async () => button('Retry machine details').click());
    expect(request).toHaveBeenCalledTimes(1);
    arm();
    expect(button('Approve machine').disabled).toBe(false);
  });
});

describe('native Studio sign-out', () => {
  it('closes Remote and clears its private data before the cookie request finishes', async () => {
    const response = Promise.withResolvers<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => response.promise),
    );
    await act(async () =>
      root.render(
        <>
          <StudioAuthControl />
          <RemotePage />
        </>,
      ),
    );
    act(() => button('Sign out').click());

    expect(client.disconnect).toHaveBeenCalledTimes(1);
    expect(store.connectionState.get()).toBe('idle');
    expect(store.connectedSessions.get()).toEqual([]);
    getAccessToken.mockResolvedValue(null);
    await act(async () => {
      response.resolve(Response.json({ ok: true }));
      await response.promise;
    });
    expect(store.connectionState.get()).toBe('idle');
  });

  it('reports a failed sign-out and keeps Remote stopped so the user can retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    await act(async () =>
      root.render(
        <>
          <StudioAuthControl />
          <RemotePage />
        </>,
      ),
    );
    await act(async () => button('Sign out').click());

    expect(store.connectionState.get()).toBe('idle');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Could not sign out');
    expect(button('Sign out').disabled).toBe(false);
  });
});
