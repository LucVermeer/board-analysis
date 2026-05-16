import { describe, expect, it, vi, beforeEach } from 'vite-plus/test';

// Capture the options passed to graphql-ws's createClient so we can drive
// the `on.closed` handler directly. We don't open a real WebSocket — the
// behaviour under test is purely the wiring between graphql-ws lifecycle
// events and the `onDisconnect` callback we expose.
const { capturedCreateClientOptions, mockGraphQLWsClient } = vi.hoisted(() => ({
  capturedCreateClientOptions: { current: null as unknown as Parameters<typeof import('graphql-ws').createClient>[0] },
  mockGraphQLWsClient: { subscribe: vi.fn(), dispose: vi.fn(), iterate: vi.fn(), terminate: vi.fn(), on: vi.fn() },
}));

vi.mock('graphql-ws', () => ({
  createClient: vi.fn((options) => {
    capturedCreateClientOptions.current = options;
    return mockGraphQLWsClient;
  }),
}));

vi.mock('../../connection-manager/websocket-connection-manager', () => ({
  connectionManager: { registerClient: vi.fn(() => vi.fn()) },
  KEEP_ALIVE_MS: 30_000,
}));

import { createGraphQLClient } from '../graphql-client';

beforeEach(() => {
  capturedCreateClientOptions.current = null as never;
});

describe('createGraphQLClient onDisconnect wiring', () => {
  it('invokes onDisconnect when the underlying socket fires `closed`', () => {
    const onDisconnect = vi.fn();
    createGraphQLClient({ url: 'ws://test', onDisconnect });

    const closedHandler = capturedCreateClientOptions.current.on?.closed;
    expect(typeof closedHandler).toBe('function');

    closedHandler?.({ code: 1006, reason: 'abnormal' } as unknown as CloseEvent);
    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });

  it('does not throw if onDisconnect is omitted', () => {
    createGraphQLClient({ url: 'ws://test' });

    const closedHandler = capturedCreateClientOptions.current.on?.closed;
    expect(() => closedHandler?.({ code: 1006 } as unknown as CloseEvent)).not.toThrow();
  });

  it('fires onDisconnect on every close, not just the first', () => {
    const onDisconnect = vi.fn();
    createGraphQLClient({ url: 'ws://test', onDisconnect });

    const closedHandler = capturedCreateClientOptions.current.on?.closed;
    closedHandler?.({ code: 1006 } as unknown as CloseEvent);
    closedHandler?.({ code: 1006 } as unknown as CloseEvent);
    closedHandler?.({ code: 1006 } as unknown as CloseEvent);
    expect(onDisconnect).toHaveBeenCalledTimes(3);
  });
});
