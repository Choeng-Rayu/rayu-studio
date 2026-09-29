/**
 * The Web Bridge wire protocol, browser side.
 *
 * A DELIBERATE MIRROR of rayu-backend/src/web-bridge/web-bridge.types.ts rather
 * than a shared package. There is no monorepo boundary between rayu-web and
 * rayu-backend — they deploy independently and version independently — so a shared
 * module would be a build-time coupling between two things that are only ever
 * coupled at runtime. The cost is that a protocol change has to be made twice; the
 * benefit is that neither repo can be blocked by the other's release.
 *
 * If these ever drift, the symptom is an event that arrives and is ignored. Keep
 * the event-name constants in sync first — the payload interfaces are only
 * compile-time documentation on this side.
 */

import { API_BASE_URL } from '~/lib/rayu/config';

/** socket.io HTTP path. Must match `WEB_BRIDGE_WS_PATH` in the backend. */
export const WEB_BRIDGE_WS_PATH = '/api/rayu-ws';

/** Namespace the browser connects to. */
export const WEB_BRIDGE_NAMESPACE = '/web-bridge';

/**
 * Derive the socket.io origin from the REST base URL.
 *
 * `VITE_RAYU_BACKEND_URL` points at the API INCLUDING its `/api` suffix (e.g.
 * `https://rayucode.com/api`), while socket.io wants the ORIGIN plus a separate
 * `path`. The `/api` is therefore stripped here and reappears in
 * `WEB_BRIDGE_WS_PATH` — which is where it has to live, because the production
 * reverse proxy routes on `/api/*` and would otherwise hand the handshake to the
 * Next.js server.
 *
 * Lives in this module, alongside the path and namespace it is combined with, rather
 * than in webBridgeClient.ts: those three values are one addressing decision, and
 * keeping them together means they can be asserted without pulling in the socket
 * client (and, through it, the auth session and next-auth).
 */
export function bridgeOrigin(base: string = API_BASE_URL): string {
  try {
    return new URL(base).origin;
  } catch {
    /*
     * A relative base (`/api`) means same-origin, which is the normal production shape
     * behind the proxy. socket.io reads an empty URL as "this origin".
     */
    return '';
  }
}

/** Events the backend sends us. */
export const BRIDGE_EVENT = {
  SESSION_LIST: 'session_list',
  HISTORY: 'history',
  SESSION_ATTACHED: 'session_attached',
  STREAM_DELTA: 'stream_delta',
  STREAM_END: 'stream_end',
  TOOL_CALL: 'tool_call',
  ACTIVITY: 'activity',
  INTERRUPT_ACK: 'interrupt_ack',
  PLAN_REQUEST: 'plan_request',
  QUESTION_REQUEST: 'question_request',

  /**
   * A pending approval is no longer answerable — the turn was interrupted, or it was
   * answered at the terminal instead.
   *
   * Relaying this is what stops a card lingering with live-looking Allow/Deny buttons
   * for a decision nobody is waiting on. A control that does nothing when pressed is
   * worse than no control, because this is the one gate that has to be trusted.
   */
  CANCEL_REQUEST: 'cancel_request',
  TOKEN_EXPIRED: 'token_expired',
  BRIDGE_ERROR: 'bridge_error',
} as const;

/** Commands we send to the backend. */
export const BRIDGE_COMMAND = {
  ATTACH_SESSION: 'attach_session',
  SEND_PROMPT: 'send_prompt',

  /** The canonical `BridgeDecision`, for anything the three below cannot express. */
  DECISION: 'bridge_decision',
  TOOL_DECISION: 'tool_decision',
  INTERRUPT: 'interrupt',
  PLAN_DECISION: 'plan_decision',
  QUESTION_ANSWER: 'question_answer',
} as const;

/**
 * live / idle / offline, derived by the backend.
 *
 * `offline` means the CLI has no socket — prompts to it will be refused. `idle`
 * means it is connected but has produced nothing for a while. Only `live` and
 * `idle` accept prompts.
 */
export type WebBridgeSessionStatus = 'live' | 'idle' | 'offline';

export interface WebBridgeSession {
  id: string;
  machineId: string;
  hostname: string;
  cwd: string;
  sessionLabel: string | null;
  pid: number | null;
  isAttached: boolean;
  status: WebBridgeSessionStatus;

  /** ISO 8601. */
  lastSeenAt: string;
}

/**
 * One entry from a session's replay buffer.
 *
 * NOT a token: the backend coalesces a whole streaming turn into a single `text`
 * entry, so replaying history renders finished messages rather than re-animating
 * them character by character.
 */
export interface BufferedMessage {
  type: 'prompt' | 'text' | 'thinking' | 'tool' | 'activity';
  content: string;

  /** Epoch ms, stamped by the backend. */
  ts: number;
}

export interface ToolCallRequest {
  sessionId: string;
  callId: string;
  toolName: string;
  toolInput: unknown;

  /** The agent's own justification. Shown above the input preview. */
  description?: string;
  toolUseId?: string;

  /** Rules the CLI proposes granting — what a "don't ask again" checkbox applies. */
  permissionSuggestions?: unknown[];

  /** Set when the tool was refused for touching a path outside the workspace. */
  blockedPath?: string;
}

export interface PlanRequest {
  sessionId: string;
  callId: string;
  plan: string;
}

/** One selectable answer. `description` is the longer explanation beneath the label. */
export interface QuestionOption {
  label: string;
  description?: string;
}

export interface Question {
  question: string;
  header?: string;
  options: QuestionOption[];

  /** When true the user may pick several options. */
  multiSelect?: boolean;
}

/**
 * An `AskUserQuestion` interview.
 *
 * PLURAL: the tool takes an array of questions, each with its own options and its own
 * multi-select flag, and answers are returned keyed by question text.
 */
export interface QuestionRequest {
  sessionId: string;
  callId: string;
  questions: Question[];
  toolInput?: unknown;
}

export type ToolDecision = 'allow' | 'deny';

/**
 * The one decision shape, mirroring rayu-cli's `BridgePermissionResponse`.
 *
 * rayu-cli has a SINGLE decision channel — tool approval, plan approval and
 * `AskUserQuestion` are three renderings of it, all answered through the same call. The
 * fields matter individually:
 *
 *  • `message` is "keep planning, and here is why". Without it a rejection carries no
 *    feedback and the model replans blind.
 *  • `updatedPermissions` is "always allow this tool" and "approve and auto-accept
 *    edits". A boolean cannot name a rule.
 *  • `updatedInput` is how interview answers reach the tool (`updatedInput.answers`).
 *
 * The backend accepts the three narrower commands too and translates them into this,
 * which is what the helpers in webBridgeClient use.
 */
export interface BridgeDecision {
  callId: string;
  behavior: ToolDecision;
  message?: string;
  updatedInput?: Record<string, unknown>;
  updatedPermissions?: unknown[];
}

export interface StreamDeltaEvent {
  sessionId: string;
  delta: string;
  type: 'text' | 'thinking';
}

export interface StreamEndEvent {
  sessionId: string;
  finishReason?: string;
  usage?: Record<string, number>;
}

export interface ActivityEvent {
  sessionId: string;
  kind: string;
  summary: string;
}

export interface HistoryEvent {
  sessionId: string;
  messages: BufferedMessage[];
}

/** A pending approval was withdrawn by the CLI — dismiss its card. */
export interface CancelRequestEvent {
  sessionId: string;
  callId: string;
}

/** Connection state, for the UI's status pill. */
export type BridgeConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

/** Only a connected CLI can be prompted. Used by the composer and the picker. */
export function canAcceptPrompt(session: WebBridgeSession | null | undefined): boolean {
  return session?.status === 'live' || session?.status === 'idle';
}

/** `~/projects/app` on `macbook-pro`, or the CLI's own label when it set one. */
export function sessionTitle(session: WebBridgeSession): string {
  return session.sessionLabel?.trim() || session.hostname;
}

/**
 * `~/projects/app` from `/Users/alice/projects/app`.
 *
 * Cosmetic, and cheap: the picker column is 280px, so an absolute path in a home
 * directory would be all prefix and no information.
 */
export function shortenCwd(cwd: string, maxLength = 34): string {
  if (!cwd) {
    return '';
  }

  const home = cwd.match(/^(?:\/(?:home|Users)\/[^/]+)(\/.*)?$/);
  const display = home ? `~${home[1] ?? ''}` : cwd;

  if (display.length <= maxLength) {
    return display;
  }

  /*
   * Truncate from the LEFT: the trailing segments name the project, which is what
   * distinguishes two sessions on one machine.
   */
  return `…${display.slice(-(maxLength - 1))}`;
}
