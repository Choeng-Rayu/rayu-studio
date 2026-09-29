import { io, type Socket } from 'socket.io-client';
import { getAccessToken, redirectToSignIn } from '~/lib/rayu/session';
import {
  BRIDGE_COMMAND,
  WEB_BRIDGE_NAMESPACE,
  WEB_BRIDGE_WS_PATH,
  bridgeOrigin,
  type BridgeDecision,
  type ToolDecision,
} from './webBridgeTypes';

/**
 * The browser's connection to the Rayu Web Bridge.
 *
 * A thin, typed wrapper over one socket.io client. socket.io rather than a raw
 * WebSocket for three concrete reasons, all of which we would otherwise reimplement:
 * automatic reconnection with backoff, an `auth` handshake object that keeps the JWT
 * out of the URL (and therefore out of proxy access logs), and namespaces so the
 * browser and CLI channels share one HTTP path.
 *
 * SINGLE INSTANCE. The remote page is one route and multiple components subscribe to
 * the same stream, so the socket is a module singleton rather than per-component
 * state — mounting two panes must not open two connections.
 */

/** Callback for a server event. Payload is validated by the store, not here. */
type Listener = (payload: unknown) => void;

class WebBridgeClient {
  private _socket: Socket | null = null;

  private readonly _listeners = new Map<string, Set<Listener>>();

  /** Guards against two concurrent connect() calls opening two sockets. */
  private _connecting: Promise<void> | null = null;

  /**
   * True once the caller asked to disconnect.
   *
   * Needed because socket.io's own reconnection is asynchronous: without this, a
   * `token_expired` refresh racing a deliberate teardown could resurrect a socket
   * the page has already navigated away from.
   */
  private _closed = false;

  /** Open the connection, or resolve immediately if it is already open. */
  async connect(): Promise<void> {
    if (!this._socket?.connected) {
      if (!this._connecting) {
        this._closed = false;
        this._connecting = this._open().finally(() => {
          this._connecting = null;
        });
      }

      await this._connecting;
    }
  }

  private async _open(): Promise<void> {
    const token = await getAccessToken();

    if (!token) {
      /*
       * No session at all. The studio layout already gates on auth, so this means
       * the token was cleared in another tab — send the user back to sign in rather
       * than retrying a handshake that cannot succeed.
       */
      redirectToSignIn();
      throw new Error('Not signed in');
    }

    const socket = io(`${bridgeOrigin()}${WEB_BRIDGE_NAMESPACE}`, {
      path: WEB_BRIDGE_WS_PATH,
      auth: { token },

      /*
       * WebSocket only. The polling fallback would issue a long-poll per event and,
       * more importantly, needs sticky sessions to work behind a proxy — the same
       * requirement the relay is trying not to impose.
       */
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 10_000,
      timeout: 10_000,
    });

    this._socket = socket;
    this._rebindListeners();

    /*
     * Refresh the handshake token before every reconnection attempt. This is the
     * mechanism behind "let the JWT expire and the browser reconnects with no
     * visible interruption".
     */
    socket.io.on('reconnect_attempt', () => {
      void getAccessToken().then((fresh) => {
        if (fresh) {
          socket.auth = { token: fresh };
        }
      });
    });

    return new Promise<void>((resolve, reject) => {
      const onConnect = () => {
        socket.off('connect_error', onError);
        resolve();
      };
      const onError = (error: Error) => {
        socket.off('connect', onConnect);

        /*
         * A rejected handshake is not retried blindly: the backend disconnects an
         * unauthenticated socket without saying why, so the one recovery worth
         * trying is a token refresh, which the reconnect hook above performs.
         */
        reject(error);
      };
      socket.once('connect', onConnect);
      socket.once('connect_error', onError);
    });
  }

  /**
   * Reconnect with a freshly refreshed token.
   *
   * Called on `token_expired`. A full teardown rather than swapping `auth` in place,
   * because the backend's per-socket expiry is recorded at handshake time — the
   * existing socket would keep the old deadline no matter what token we attach.
   */
  async refreshAndReconnect(): Promise<void> {
    if (this._closed) {
      return;
    }

    const socket = this._socket;
    const token = await getAccessToken();

    if (!token) {
      redirectToSignIn();
      return;
    }

    if (!socket) {
      await this.connect();
      return;
    }

    socket.auth = { token };
    socket.disconnect();

    if (!this._closed) {
      socket.connect();
    }
  }

  disconnect(): void {
    this._closed = true;
    this._socket?.disconnect();
    this._socket = null;
  }

  get connected(): boolean {
    return this._socket?.connected ?? false;
  }

  /**
   * Subscribe to a server event. Returns an unsubscribe function.
   *
   * Listeners are held here, not only on the socket, so they survive a reconnect —
   * socket.io keeps handlers across reconnects but not across the socket being
   * replaced, which `refreshAndReconnect` can do.
   */
  on(event: string, listener: Listener): () => void {
    let set = this._listeners.get(event);

    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }

    set.add(listener);
    this._socket?.on(event, listener);

    return () => {
      set?.delete(listener);
      this._socket?.off(event, listener);
    };
  }

  /** Attach every registered listener to a newly created socket. */
  private _rebindListeners(): void {
    if (!this._socket) {
      return;
    }

    for (const [event, set] of this._listeners) {
      for (const listener of set) {
        this._socket.on(event, listener);
      }
    }
  }

  // --- Commands --------------------------------------------------------------

  /**
   * Send a command.
   *
   * Silently drops when disconnected rather than queuing. A queued prompt would be
   * delivered minutes later to a session the user has since switched away from,
   * which is worse than nothing happening — the UI disables the composer while
   * disconnected, so this is a guard, not the normal path.
   */
  private _emit(event: string, payload: unknown): boolean {
    if (!this._socket?.connected) {
      return false;
    }

    this._socket.emit(event, payload);

    return true;
  }

  attachSession(sessionId: string): boolean {
    return this._emit(BRIDGE_COMMAND.ATTACH_SESSION, { sessionId });
  }

  sendPrompt(sessionId: string, text: string, attachments?: string[]): boolean {
    return this._emit(BRIDGE_COMMAND.SEND_PROMPT, { sessionId, text, attachments });
  }

  /**
   * Answer a tool approval.
   *
   * `message` carries the reason for a denial — the model receives it, so "wrong
   * directory" is materially more useful than a bare refusal. `remember` is expanded
   * server-side into an allow-rule scoped to the tool the CLI actually asked about; the
   * browser deliberately does not name the tool itself.
   */
  toolDecision(
    callId: string,
    decision: ToolDecision,
    options: { remember?: boolean; message?: string; updatedPermissions?: unknown[] } = {},
  ): boolean {
    return this._emit(BRIDGE_COMMAND.TOOL_DECISION, {
      callId,
      decision,
      remember: options.remember === true,
      message: options.message,
      updatedPermissions: options.updatedPermissions,
    });
  }

  /**
   * Answer a plan approval — the same three decisions rayu-cli's own plan card offers.
   *
   * `acceptEdits` is approve-AND-auto-accept-edits (a session permission-mode change),
   * distinct from plain approval. `message` is the feedback that goes back with a
   * rejection, which is what makes "keep planning" useful rather than silent.
   */
  planDecision(callId: string, approved: boolean, options: { acceptEdits?: boolean; message?: string } = {}): boolean {
    return this._emit(BRIDGE_COMMAND.PLAN_DECISION, {
      callId,
      approved,
      acceptEdits: options.acceptEdits === true,
      message: options.message,
    });
  }

  /**
   * Answer an `AskUserQuestion` interview.
   *
   * `answers` is keyed by QUESTION TEXT, which is the key the tool reads. A multi-select
   * answer is its chosen labels joined, matching what the Telegram bridge sends.
   */
  questionAnswer(callId: string, answers: Record<string, string>, annotations?: Record<string, string>): boolean {
    return this._emit(BRIDGE_COMMAND.QUESTION_ANSWER, { callId, answers, annotations });
  }

  /** The canonical decision, for anything the three helpers above cannot express. */
  decision(payload: BridgeDecision): boolean {
    return this._emit(BRIDGE_COMMAND.DECISION, payload);
  }

  interrupt(sessionId: string): boolean {
    return this._emit(BRIDGE_COMMAND.INTERRUPT, { sessionId });
  }

  /** Lifecycle hooks the store needs; kept off `on()` since these are socket-level. */
  onLifecycle(handlers: {
    connect?: () => void;
    disconnect?: (reason: string) => void;
    connectError?: (error: Error) => void;
  }): () => void {
    const socket = this._socket;

    if (!socket) {
      return () => undefined;
    }

    if (handlers.connect) {
      socket.on('connect', handlers.connect);
    }

    if (handlers.disconnect) {
      socket.on('disconnect', handlers.disconnect);
    }

    if (handlers.connectError) {
      socket.on('connect_error', handlers.connectError);
    }

    return () => {
      if (handlers.connect) {
        socket.off('connect', handlers.connect);
      }

      if (handlers.disconnect) {
        socket.off('disconnect', handlers.disconnect);
      }

      if (handlers.connectError) {
        socket.off('connect_error', handlers.connectError);
      }
    };
  }
}

/** The one connection for the remote page. */
export const webBridgeClient = new WebBridgeClient();
