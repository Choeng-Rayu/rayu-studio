import { atom } from 'nanostores';
import { toast } from 'react-toastify';
import { webBridgeClient } from './webBridgeClient';
import {
  BRIDGE_EVENT,
  type ActivityEvent,
  type BridgeConnectionState,
  type BufferedMessage,
  type HistoryEvent,
  type PlanRequest,
  type QuestionRequest,
  type StreamDeltaEvent,
  type StreamEndEvent,
  type ToolCallRequest,
  type ToolDecision,
  type WebBridgeSession,
} from './webBridgeTypes';

/**
 * State for the remote-control page.
 *
 * nanostores, matching the studio's other cross-component state (theme, chat,
 * workbench). The alternative — React state lifted into `RemotePage` — would make
 * every stream delta re-render the session picker and the composer along with the
 * message pane.
 *
 * ONE SOURCE OF TRUTH, AND IT IS THE SERVER. Nothing here is optimistic: the picker
 * highlights a session when `session_attached` arrives, not when it is clicked, and
 * the composer re-enables on `stream_end`, not on send. Remote control that lies
 * about what the far end is doing is worse than remote control that is a beat slow.
 */

/** Every machine this user has, live or not. */
export const connectedSessions = atom<WebBridgeSession[]>([]);

/** The session prompts are routed to. Server-confirmed. */
export const attachedSessionId = atom<string | null>(null);

/** Replay buffer for the attached session, oldest-first. */
export const messageHistory = atom<BufferedMessage[]>([]);

/** Accumulating answer text for the in-flight turn. */
export const streamingContent = atom<string>('');

/** Accumulating reasoning text for the in-flight turn, shown collapsed. */
export const streamingThinking = atom<string>('');

/** True between the first delta and `stream_end`. Gates the interrupt button. */
export const isStreaming = atom<boolean>(false);

export const pendingToolCall = atom<ToolCallRequest | null>(null);
export const pendingPlanRequest = atom<PlanRequest | null>(null);
export const pendingQuestion = atom<QuestionRequest | null>(null);

export const connectionState = atom<BridgeConnectionState>('idle');

/** Last refusal from the backend, shown inline above the composer. */
export const bridgeError = atom<string | null>(null);

/** The attached session object, or null. Derived on read — the list is small. */
export function getAttachedSession(): WebBridgeSession | null {
  const id = attachedSessionId.get();
  return id ? (connectedSessions.get().find((s) => s.id === id) ?? null) : null;
}

/**
 * Guard against binding twice.
 *
 * React 18+ mounts effects twice in development. Without this, every event would be
 * handled twice — visible as doubled characters in a streaming response.
 */
let bound = false;
let unbind: Array<() => void> = [];

/**
 * Connect and start applying server events to the store.
 *
 * Idempotent. Returns a teardown that removes the listeners but LEAVES THE SOCKET
 * OPEN by default, because a route change inside the studio should not drop a
 * running session; `stopWebBridge` is the explicit close.
 */
export async function startWebBridge(): Promise<void> {
  if (!bound) {
    bindHandlers();
    bound = true;
  }

  connectionState.set('connecting');

  try {
    await webBridgeClient.connect();
    connectionState.set('connected');
    bindLifecycle();
  } catch (error) {
    connectionState.set('error');
    bridgeError.set(error instanceof Error ? error.message : 'Could not reach the bridge');
  }
}

export function stopWebBridge(): void {
  for (const off of unbind) {
    off();
  }

  unbind = [];
  bound = false;
  webBridgeClient.disconnect();
  connectionState.set('idle');
}

function bindLifecycle(): void {
  unbind.push(
    webBridgeClient.onLifecycle({
      connect: () => {
        connectionState.set('connected');
        bridgeError.set(null);
      },
      disconnect: () => {
        connectionState.set('reconnecting');

        /*
         * A dropped socket says nothing about the CLI — it kept working. Clearing
         * `isStreaming` avoids a permanently disabled composer, but the accumulated
         * text stays: the reconnect delivers the buffer, which contains the finished
         * message, and discarding it here would blank the pane mid-answer.
         */
        isStreaming.set(false);
      },
      connectError: (error) => {
        connectionState.set('reconnecting');
        bridgeError.set(error.message);
      },
    }),
  );
}

function bindHandlers(): void {
  unbind.push(
    webBridgeClient.on(BRIDGE_EVENT.SESSION_LIST, (payload) => {
      const sessions = payload as WebBridgeSession[];

      if (!Array.isArray(sessions)) {
        return;
      }

      connectedSessions.set(sessions);

      const attached = sessions.find((s) => s.isAttached);

      /*
       * The server owns the selection, so this follows it rather than asserting it —
       * that is what makes a second tab's switch show up here.
       */
      attachedSessionId.set(attached?.id ?? null);
    }),

    webBridgeClient.on(BRIDGE_EVENT.SESSION_ATTACHED, (payload) => {
      const { sessionId } = (payload ?? {}) as { sessionId?: string };

      if (!sessionId) {
        return;
      }

      attachedSessionId.set(sessionId);

      /*
       * A new session means a new conversation: stale deltas from the previous one
       * must not appear under it.
       */
      resetTurn();
    }),

    webBridgeClient.on(BRIDGE_EVENT.HISTORY, (payload) => {
      const event = payload as HistoryEvent;

      if (!event?.sessionId || !Array.isArray(event.messages)) {
        return;
      }

      // Ignore history for a session we have since switched away from.
      if (event.sessionId !== attachedSessionId.get()) {
        return;
      }

      messageHistory.set(event.messages);
    }),

    webBridgeClient.on(BRIDGE_EVENT.STREAM_DELTA, (payload) => {
      const event = payload as StreamDeltaEvent;

      if (!isForAttachedSession(event?.sessionId) || typeof event.delta !== 'string') {
        return;
      }

      isStreaming.set(true);

      if (event.type === 'thinking') {
        streamingThinking.set(streamingThinking.get() + event.delta);
      } else {
        streamingContent.set(streamingContent.get() + event.delta);
      }
    }),

    webBridgeClient.on(BRIDGE_EVENT.STREAM_END, (payload) => {
      const event = payload as StreamEndEvent;

      if (!isForAttachedSession(event?.sessionId)) {
        return;
      }

      commitTurn();
    }),

    webBridgeClient.on(BRIDGE_EVENT.INTERRUPT_ACK, (payload) => {
      const { sessionId } = (payload ?? {}) as { sessionId?: string };

      if (!isForAttachedSession(sessionId)) {
        return;
      }

      /*
       * The composer re-enables HERE, on the CLI's acknowledgement, not when the
       * stop button was clicked. Otherwise the UI would claim a turn had stopped
       * when the signal never landed.
       */
      commitTurn();

      // A cancelled approval is no longer answerable.
      pendingToolCall.set(null);
      pendingPlanRequest.set(null);
      pendingQuestion.set(null);
      toast.info('Turn interrupted');
    }),

    webBridgeClient.on(BRIDGE_EVENT.TOOL_CALL, (payload) => {
      const event = payload as ToolCallRequest;

      if (!isForAttachedSession(event?.sessionId) || !event.callId) {
        return;
      }

      pendingToolCall.set(event);
    }),

    webBridgeClient.on(BRIDGE_EVENT.PLAN_REQUEST, (payload) => {
      const event = payload as PlanRequest;

      if (!isForAttachedSession(event?.sessionId) || !event.callId) {
        return;
      }

      pendingPlanRequest.set(event);
    }),

    webBridgeClient.on(BRIDGE_EVENT.QUESTION_REQUEST, (payload) => {
      const event = payload as QuestionRequest;

      if (!isForAttachedSession(event?.sessionId) || !event.callId) {
        return;
      }

      pendingQuestion.set({ ...event, questions: event.questions ?? [] });
    }),

    webBridgeClient.on(BRIDGE_EVENT.CANCEL_REQUEST, (payload) => {
      const { callId } = (payload ?? {}) as { callId?: string };

      if (!callId) {
        return;
      }

      /*
       * Dismiss whichever card is showing this callId. Matched by id rather than
       * blanket-cleared: cancelling one approval must not silently drop a different one
       * the user is mid-way through answering.
       */
      if (pendingToolCall.get()?.callId === callId) {
        pendingToolCall.set(null);
      }

      if (pendingPlanRequest.get()?.callId === callId) {
        pendingPlanRequest.set(null);
      }

      if (pendingQuestion.get()?.callId === callId) {
        pendingQuestion.set(null);
      }
    }),

    webBridgeClient.on(BRIDGE_EVENT.ACTIVITY, (payload) => {
      const event = payload as ActivityEvent;

      if (!isForAttachedSession(event?.sessionId)) {
        return;
      }

      /*
       * A prompt echo is appended as a message so a second tab shows what the first
       * one typed. Other activity kinds are transient status and are not persisted
       * into the local list — the server's buffer already has them for a reload.
       */
      if (event.kind === 'prompt') {
        appendLocal({ type: 'prompt', content: event.summary, ts: Date.now() });
      } else {
        appendLocal({ type: 'activity', content: event.summary || event.kind, ts: Date.now() });
      }
    }),

    webBridgeClient.on(BRIDGE_EVENT.TOKEN_EXPIRED, () => {
      /*
       * The backend warns a minute before the JWT dies. Refreshing and reconnecting
       * now is what makes token rotation invisible to the user.
       */
      connectionState.set('reconnecting');
      void webBridgeClient.refreshAndReconnect();
    }),

    webBridgeClient.on(BRIDGE_EVENT.BRIDGE_ERROR, (payload) => {
      const { message } = (payload ?? {}) as { message?: string };
      const text = message ?? 'The bridge refused that request';
      bridgeError.set(text);
      toast.error(text);
    }),
  );
}

// --- Commands ----------------------------------------------------------------

export function attachSession(sessionId: string): void {
  bridgeError.set(null);

  if (!webBridgeClient.attachSession(sessionId)) {
    bridgeError.set('Not connected to the bridge');
  }
}

export function sendPrompt(text: string, attachments?: string[]): void {
  const sessionId = attachedSessionId.get();

  if (!sessionId) {
    bridgeError.set('Pick a session first');
    return;
  }

  const trimmed = text.trim();

  if (!trimmed) {
    return;
  }

  bridgeError.set(null);

  if (!webBridgeClient.sendPrompt(sessionId, trimmed, attachments)) {
    bridgeError.set('Not connected to the bridge');
    return;
  }

  /*
   * The turn is marked in flight immediately so the stop button is available before
   * the first token arrives — a long tool-heavy turn can take seconds to emit
   * anything, and being unable to cancel during that window is the case a user most
   * wants to cancel in.
   */
  isStreaming.set(true);
  resetTurn();
}

/**
 * Answer a tool approval.
 *
 * `message` is the reason for a denial and reaches the model. `remember` becomes an
 * allow-rule scoped server-side to the tool the CLI asked about.
 */
export function respondToTool(decision: ToolDecision, options: { remember?: boolean; message?: string } = {}): void {
  const pending = pendingToolCall.get();

  if (!pending) {
    return;
  }

  pendingToolCall.set(null);
  webBridgeClient.toolDecision(pending.callId, decision, {
    remember: options.remember,
    message: options.message,

    /*
     * Echo the CLI's OWN suggested rules when remembering. The CLI proposed them, so
     * they are more precise than anything derived from a checkbox — a suggestion for
     * `Bash(git:*)` is a far better grant than a blanket allow on `Bash`.
     */
    updatedPermissions: options.remember && decision === 'allow' ? pending.permissionSuggestions : undefined,
  });
}

/**
 * Answer a plan approval.
 *
 * Three outcomes, matching rayu-cli's own card: approve, approve and auto-accept edits
 * for the rest of the session, or send the model back to planning with feedback.
 */
export function respondToPlan(approved: boolean, options: { acceptEdits?: boolean; message?: string } = {}): void {
  const pending = pendingPlanRequest.get();

  if (!pending) {
    return;
  }

  pendingPlanRequest.set(null);
  webBridgeClient.planDecision(pending.callId, approved, options);
}

/**
 * Submit an interview's answers.
 *
 * Keyed by question text, which is the key the tool reads. Multi-select answers arrive
 * already joined by the card.
 */
export function answerQuestions(answers: Record<string, string>, annotations?: Record<string, string>): void {
  const pending = pendingQuestion.get();

  if (!pending) {
    return;
  }

  pendingQuestion.set(null);
  webBridgeClient.questionAnswer(pending.callId, answers, annotations);
}

export function interrupt(): void {
  const sessionId = attachedSessionId.get();

  if (!sessionId) {
    return;
  }

  webBridgeClient.interrupt(sessionId);
}

// --- Internals ---------------------------------------------------------------

function isForAttachedSession(sessionId: string | undefined): boolean {
  return Boolean(sessionId) && sessionId === attachedSessionId.get();
}

/**
 * Move the in-flight turn into the message list.
 *
 * Local append rather than waiting for the server's buffer: the buffer is fetched
 * on attach, not pushed on every turn, so without this a finished answer would
 * vanish from the pane the moment streaming stopped.
 */
function commitTurn(): void {
  const thinking = streamingThinking.get();
  const text = streamingContent.get();
  const ts = Date.now();

  if (thinking) {
    appendLocal({ type: 'thinking', content: thinking, ts });
  }

  if (text) {
    appendLocal({ type: 'text', content: text, ts });
  }

  resetTurn();
  isStreaming.set(false);
}

function resetTurn(): void {
  streamingContent.set('');
  streamingThinking.set('');
}

/** Keeps the rendered list bounded to the same 50 the server buffers. */
function appendLocal(message: BufferedMessage): void {
  const next = [...messageHistory.get(), message];
  messageHistory.set(next.length > 50 ? next.slice(next.length - 50) : next);
}
