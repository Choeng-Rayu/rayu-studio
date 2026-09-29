/**
 * Studio-side Web Bridge tests.
 *
 * Scope is the pure logic: the display helpers the session picker depends on, the
 * origin derivation that decides whether the handshake reaches the backend at all, and
 * the protocol constants that MUST match rayu-backend. The socket client and the store
 * are exercised through the running app rather than here — a socket.io mock would
 * assert against the mock, not against the protocol.
 *
 * The constant assertions look tautological but are not: these are literal duplicates
 * of rayu-backend/src/web-bridge/web-bridge.types.ts, and a silent rename there is
 * exactly the failure this file is here to make loud.
 */

import { describe, expect, it } from 'vitest';
import {
  BRIDGE_COMMAND,
  BRIDGE_EVENT,
  WEB_BRIDGE_NAMESPACE,
  WEB_BRIDGE_WS_PATH,
  bridgeOrigin,
  canAcceptPrompt,
  sessionTitle,
  shortenCwd,
  type WebBridgeSession,
} from './webBridgeTypes';

function session(overrides: Partial<WebBridgeSession> = {}): WebBridgeSession {
  return {
    id: 'sess_1',
    machineId: 'm_abc123',
    hostname: 'macbook-pro',
    cwd: '/Users/alice/projects/myapp',
    sessionLabel: null,
    pid: 4242,
    isAttached: false,
    status: 'live',
    lastSeenAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('protocol constants', () => {
  it('keeps the socket.io path under /api', () => {
    /*
     * Load-bearing. The production reverse proxy routes /api/* to rayu-backend and
     * everything else to this Next.js app, so a path outside /api would hand the
     * WebSocket handshake to Next and 404 — in production only, while working fine on
     * localhost. This assertion is the tripwire for that.
     */
    expect(WEB_BRIDGE_WS_PATH.startsWith('/api/')).toBe(true);
    expect(WEB_BRIDGE_WS_PATH).toBe('/api/rayu-ws');
  });

  it('uses the browser namespace, not the CLI one', () => {
    expect(WEB_BRIDGE_NAMESPACE).toBe('/web-bridge');
  });

  it('matches the backend event names', () => {
    expect(BRIDGE_EVENT).toEqual({
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
      CANCEL_REQUEST: 'cancel_request',
      TOKEN_EXPIRED: 'token_expired',
      BRIDGE_ERROR: 'bridge_error',
    });
  });

  it('matches the backend command names', () => {
    expect(BRIDGE_COMMAND).toEqual({
      ATTACH_SESSION: 'attach_session',
      SEND_PROMPT: 'send_prompt',
      DECISION: 'bridge_decision',
      TOOL_DECISION: 'tool_decision',
      INTERRUPT: 'interrupt',
      PLAN_DECISION: 'plan_decision',
      QUESTION_ANSWER: 'question_answer',
    });
  });

  it('has a cancel event, so an approval card cannot outlive its request', () => {
    /*
     * rayu-cli's permission channel has `cancelRequest(requestId)`. Without relaying it,
     * a card sits on screen offering Allow/Deny for a decision nobody is waiting on, and
     * pressing it does nothing — which teaches the user to distrust the one control that
     * must be trustworthy.
     */
    expect(BRIDGE_EVENT.CANCEL_REQUEST).toBe('cancel_request');
  });

  it('has a canonical decision command carrying the full response shape', () => {
    /*
     * rayu-cli answers tool, plan and question requests through ONE
     * `BridgePermissionResponse`. This command is that shape; the three narrower ones are
     * translated into it server-side.
     */
    expect(BRIDGE_COMMAND.DECISION).toBe('bridge_decision');
  });
});

describe('canAcceptPrompt', () => {
  it('accepts a live session', () => {
    expect(canAcceptPrompt(session({ status: 'live' }))).toBe(true);
  });

  it('accepts an idle session — connected but quiet still routes', () => {
    expect(canAcceptPrompt(session({ status: 'idle' }))).toBe(true);
  });

  it('refuses an offline session', () => {
    /*
     * The composer disables on this, which is what turns a silently dropped prompt
     * into a visible "that machine is offline".
     */
    expect(canAcceptPrompt(session({ status: 'offline' }))).toBe(false);
  });

  it('refuses when nothing is selected', () => {
    expect(canAcceptPrompt(null)).toBe(false);
    expect(canAcceptPrompt(undefined)).toBe(false);
  });
});

describe('sessionTitle', () => {
  it('prefers the CLI-supplied label', () => {
    expect(sessionTitle(session({ sessionLabel: 'api refactor' }))).toBe('api refactor');
  });

  it('falls back to the hostname when there is no label', () => {
    expect(sessionTitle(session({ sessionLabel: null }))).toBe('macbook-pro');
  });

  it('treats a whitespace-only label as absent', () => {
    // A blank row in the picker is worse than a hostname.
    expect(sessionTitle(session({ sessionLabel: '   ' }))).toBe('macbook-pro');
  });
});

describe('shortenCwd', () => {
  it('collapses a macOS home directory', () => {
    expect(shortenCwd('/Users/alice/projects/myapp')).toBe('~/projects/myapp');
  });

  it('collapses a Linux home directory', () => {
    expect(shortenCwd('/home/bob/work/api')).toBe('~/work/api');
  });

  it('collapses the home directory itself', () => {
    expect(shortenCwd('/home/bob')).toBe('~');
  });

  it('leaves a path outside a home directory alone', () => {
    expect(shortenCwd('/srv/app')).toBe('/srv/app');
  });

  it('truncates from the left so the project name survives', () => {
    const result = shortenCwd('/home/bob/very/deeply/nested/path/to/the/project', 20);
    expect(result).toHaveLength(20);

    // The trailing segments are what distinguish two sessions on one machine.
    expect(result.endsWith('project')).toBe(true);
    expect(result.startsWith('…')).toBe(true);
  });

  it('returns an empty string for an empty cwd', () => {
    expect(shortenCwd('')).toBe('');
  });
});

describe('bridgeOrigin', () => {
  it('strips the /api suffix, which socket.io carries in `path` instead', () => {
    expect(bridgeOrigin('https://rayucode.com/api')).toBe('https://rayucode.com');
  });

  it('keeps a non-default port', () => {
    expect(bridgeOrigin('http://localhost:4000/api')).toBe('http://localhost:4000');
  });

  it('returns empty for a relative base, meaning same-origin', () => {
    // The normal production shape behind the proxy; socket.io reads '' as this origin.
    expect(bridgeOrigin('/api')).toBe('');
  });
});
