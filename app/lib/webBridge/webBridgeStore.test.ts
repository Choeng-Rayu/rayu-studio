/**
 * Remote page store — how pending approvals are queued, shown and retired.
 *
 * The socket client is replaced by a stub that captures the store's event handlers, so
 * these tests drive the REAL store logic with server frames. They assert state
 * handling only; the wire protocol is covered by webBridge.test.ts and by the backend's
 * real-socket gateway spec.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('./webBridgeClient', () => ({
  webBridgeClient: {
    ...client,
    on: (event: string, listener: (payload: unknown) => void) => {
      handlers.set(event, listener);
      return () => handlers.delete(event);
    },
  },
}));
vi.mock('react-toastify', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));

const store = await import('./webBridgeStore');
const { BRIDGE_EVENT } = await import('./webBridgeTypes');

function emit(event: string, payload: unknown): void {
  const handler = handlers.get(event);

  if (!handler) {
    throw new Error(`no handler bound for ${event}`);
  }

  handler(payload);
}

function session(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    machineId: `m_${id}`,
    hostname: 'box',
    cwd: '/app',
    sessionLabel: null,
    pid: 1,
    isAttached: false,
    status: 'live',
    lastSeenAt: new Date().toISOString(),
    ...overrides,
  };
}

const toolCall = (sessionId: string, callId: string) => ({ sessionId, callId, toolName: 'Bash', toolInput: {} });

beforeEach(async () => {
  vi.clearAllMocks();
  client.toolDecision.mockReturnValue(true);
  await store.startWebBridge();
  emit(BRIDGE_EVENT.SESSION_LIST, [session('A', { isAttached: true }), session('B')]);
});

afterEach(() => {
  store.stopWebBridge();
});

describe('tool approvals', () => {
  it('queues concurrent requests instead of overwriting the first', () => {
    emit(BRIDGE_EVENT.TOOL_CALL, toolCall('A', 'c1'));
    emit(BRIDGE_EVENT.TOOL_CALL, toolCall('A', 'c2'));

    expect(store.pendingToolCall.get()?.callId).toBe('c1');
    expect(store.toolCallsWaiting.get()).toBe(2);

    store.respondToTool('c1', 'allow');

    expect(client.toolDecision).toHaveBeenCalledWith('c1', 'allow', expect.anything());
    expect(store.pendingToolCall.get()?.callId).toBe('c2');
  });

  it('answers only the request a card showed: a repeat click does not answer the next one', () => {
    emit(BRIDGE_EVENT.TOOL_CALL, toolCall('A', 'c1'));
    emit(BRIDGE_EVENT.TOOL_CALL, toolCall('A', 'c2'));

    store.respondToTool('c1', 'allow');
    store.respondToTool('c1', 'allow');

    expect(client.toolDecision).toHaveBeenCalledTimes(1);
    expect(store.pendingToolCall.get()?.callId).toBe('c2');
  });

  it('shows a request only under the session that asked, and keeps it across a switch', () => {
    emit(BRIDGE_EVENT.TOOL_CALL, toolCall('B', 'b1'));
    expect(store.pendingToolCall.get()).toBeNull();

    emit(BRIDGE_EVENT.SESSION_ATTACHED, { sessionId: 'B' });
    expect(store.pendingToolCall.get()?.callId).toBe('b1');

    emit(BRIDGE_EVENT.SESSION_ATTACHED, { sessionId: 'A' });
    expect(store.pendingToolCall.get()).toBeNull();
  });

  it('dismisses exactly the cancelled request', () => {
    emit(BRIDGE_EVENT.TOOL_CALL, toolCall('A', 'c1'));
    emit(BRIDGE_EVENT.TOOL_CALL, toolCall('A', 'c2'));
    emit(BRIDGE_EVENT.CANCEL_REQUEST, { sessionId: 'A', callId: 'c1' });

    expect(store.toolCallQueue.get().map((c) => c.callId)).toEqual(['c2']);
  });

  it('does not show the same request twice when it is re-sent, and keeps its place', () => {
    emit(BRIDGE_EVENT.TOOL_CALL, toolCall('A', 'c1'));
    emit(BRIDGE_EVENT.TOOL_CALL, toolCall('A', 'c2'));
    emit(BRIDGE_EVENT.TOOL_CALL, toolCall('A', 'c1'));

    expect(store.toolCallQueue.get().map((c) => c.callId)).toEqual(['c1', 'c2']);
    expect(store.pendingToolCall.get()?.callId).toBe('c1');
  });

  it('keeps the card, and says so, when the answer could not be sent', () => {
    emit(BRIDGE_EVENT.TOOL_CALL, toolCall('A', 'c1'));
    client.toolDecision.mockReturnValue(false);

    store.respondToTool('c1', 'allow');

    expect(store.pendingToolCall.get()?.callId).toBe('c1');
    expect(store.bridgeError.get()).toMatch(/not sent/);
  });

  it('drops the approvals of a machine that went offline', () => {
    emit(BRIDGE_EVENT.TOOL_CALL, toolCall('A', 'a1'));
    emit(BRIDGE_EVENT.TOOL_CALL, toolCall('B', 'b1'));

    emit(BRIDGE_EVENT.SESSION_LIST, [
      session('A', { isAttached: true, status: 'offline' }),
      session('B', { status: 'idle' }),
    ]);

    // Idle still routes, so B's request stays answerable; offline cannot.
    expect(store.toolCallQueue.get().map((c) => c.callId)).toEqual(['b1']);
  });

  it('clears a session\u2019s approvals when its turn is interrupted, and only that session\u2019s', () => {
    emit(BRIDGE_EVENT.TOOL_CALL, toolCall('A', 'a1'));
    emit(BRIDGE_EVENT.TOOL_CALL, toolCall('B', 'b1'));
    emit(BRIDGE_EVENT.INTERRUPT_ACK, { sessionId: 'A' });

    expect(store.toolCallQueue.get().map((c) => c.callId)).toEqual(['b1']);
  });

  it('forgets every approval when the page stops listening', () => {
    emit(BRIDGE_EVENT.TOOL_CALL, toolCall('A', 'a1'));
    emit(BRIDGE_EVENT.PLAN_REQUEST, { sessionId: 'A', callId: 'p1', plan: 'x' });

    store.stopWebBridge();

    expect(store.toolCallQueue.get()).toEqual([]);
    expect(store.planRequestQueue.get()).toEqual([]);
  });

  it('counts the approvals each machine is waiting on, attached or not', () => {
    emit(BRIDGE_EVENT.TOOL_CALL, toolCall('A', 'a1'));
    emit(BRIDGE_EVENT.TOOL_CALL, toolCall('B', 'b1'));
    emit(BRIDGE_EVENT.PLAN_REQUEST, { sessionId: 'B', callId: 'b2', plan: 'x' });

    expect(store.approvalsWaitingBySession.get()).toEqual({ A: 1, B: 2 });
  });
});

describe('plan and question approvals', () => {
  it('answers the attached session\u2019s plan and retires it', () => {
    emit(BRIDGE_EVENT.PLAN_REQUEST, { sessionId: 'A', callId: 'p1', plan: '1. Ship' });

    store.respondToPlan('p1', true, { acceptEdits: true });

    expect(client.planDecision).toHaveBeenCalledWith('p1', true, { acceptEdits: true });
    expect(store.pendingPlanRequest.get()).toBeNull();
  });

  it('answers the attached session\u2019s interview and retires it', () => {
    emit(BRIDGE_EVENT.QUESTION_REQUEST, {
      sessionId: 'A',
      callId: 'q1',
      questions: [{ question: 'Which?', options: [{ label: 'One' }] }],
    });

    store.answerQuestions('q1', { 'Which?': 'One' });

    expect(client.questionAnswer).toHaveBeenCalledWith('q1', { 'Which?': 'One' }, undefined);
    expect(store.pendingQuestion.get()).toBeNull();
  });
});
