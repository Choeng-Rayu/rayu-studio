import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { io, getAccessToken, redirectToSignIn } = vi.hoisted(() => ({
  io: vi.fn(),
  getAccessToken: vi.fn(),
  redirectToSignIn: vi.fn(),
}));
vi.mock('socket.io-client', () => ({ io }));
vi.mock('../rayu/session', () => ({ getAccessToken, redirectToSignIn }));

let client: typeof import('./webBridgeClient').webBridgeClient;
let socket: EventEmitter & {
  connected: boolean;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  getAccessToken.mockResolvedValue('account-token');
  io.mockImplementation(() => {
    socket = Object.assign(new EventEmitter(), { connected: false, connect: vi.fn(), disconnect: vi.fn() });
    return socket;
  });
  ({ webBridgeClient: client } = await import('./webBridgeClient'));
});

describe('browser remote transport', () => {
  it('does not open a socket after leaving during token lookup', async () => {
    const lookup = Promise.withResolvers<string>();
    getAccessToken.mockReturnValueOnce(lookup.promise);

    const connection = client.connect();
    client.disconnect();
    lookup.resolve('late-token');
    await expect(connection).rejects.toThrow('cancelled');
    expect(io).not.toHaveBeenCalled();
  });

  it('settles a pending handshake when the page closes', async () => {
    const connection = client.connect();
    await vi.waitFor(() => expect(io).toHaveBeenCalledTimes(1));
    client.disconnect();
    await expect(connection).rejects.toThrow('cancelled');
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
  });

  it('shares one socket for concurrent connection requests', async () => {
    const first = client.connect();
    const repeated = client.connect();
    await vi.waitFor(() => expect(io).toHaveBeenCalledTimes(1));
    socket.connected = true;
    socket.emit('connect');
    await Promise.all([first, repeated]);
    expect(io).toHaveBeenCalledTimes(1);
    client.disconnect();
  });

  it('waits for a fresh token before reconnecting and discards one arriving after close', async () => {
    const connection = client.connect();
    await vi.waitFor(() => expect(io).toHaveBeenCalledTimes(1));
    socket.connected = true;
    socket.emit('connect');
    await connection;

    const lookup = Promise.withResolvers<string>();
    getAccessToken.mockReturnValueOnce(lookup.promise);

    const done = vi.fn();
    const auth = io.mock.calls[0][1].auth as (callback: typeof done) => void;
    auth(done);
    expect(done).not.toHaveBeenCalled();
    client.disconnect();
    lookup.resolve('late-token');
    await lookup.promise;
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
  });

  it('does not redirect or reopen after close during a refresh', async () => {
    const connection = client.connect();
    await vi.waitFor(() => expect(io).toHaveBeenCalledTimes(1));
    socket.connected = true;
    socket.emit('connect');
    await connection;

    const lookup = Promise.withResolvers<null>();
    getAccessToken.mockReturnValueOnce(lookup.promise);

    const refreshing = client.refreshAndReconnect();
    client.disconnect();
    lookup.resolve(null);
    await refreshing;
    expect(redirectToSignIn).not.toHaveBeenCalled();
    expect(socket.connect).not.toHaveBeenCalled();
  });
});
