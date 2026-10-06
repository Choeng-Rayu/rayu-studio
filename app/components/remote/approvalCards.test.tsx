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
const { APPROVAL_ARM_DELAY_MS } = await import('./useArmed');

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
