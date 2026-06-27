import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { CreateGraphQLClientOptions, ExtendedClient } from '@boardsesh/graphql-client';

// ── Capture the options passed to createGraphQLClient ───────────────────────
// ws-client builds a real graphql-ws Client; we don't want a socket. Mock the
// factory to record the options (connectionParams / shouldRetry) and hand back a
// fake client whose dispose() we can observe.
let capturedOptions: CreateGraphQLClientOptions | null = null;
const disposeSpy = vi.fn();

function makeFakeClient(): ExtendedClient {
  return { dispose: disposeSpy } as unknown as ExtendedClient;
}

vi.mock('@boardsesh/graphql-client', () => ({
  createGraphQLClient: (options: CreateGraphQLClientOptions) => {
    capturedOptions = options;
    return makeFakeClient();
  },
}));

// ── Mock the auth helpers ws-client reuses ──────────────────────────────────
vi.mock('../../auth-store', () => ({
  getAuthToken: vi.fn().mockResolvedValue('jwt-token'),
}));

vi.mock('../../auth-interceptor', () => ({
  ensureFreshToken: vi.fn().mockResolvedValue(true),
  deduplicatedRefresh: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../env', () => ({ BACKEND_URL: 'https://api.test' }));

import { getWsClient, disposeWsClient } from '../ws-client';
import { getAuthToken } from '../../auth-store';
import { ensureFreshToken, deduplicatedRefresh } from '../../auth-interceptor';

const mockGetAuthToken = getAuthToken as Mock;
const mockEnsureFreshToken = ensureFreshToken as Mock;
const mockDeduplicatedRefresh = deduplicatedRefresh as Mock;

function connectionParams() {
  if (!capturedOptions || !('connectionParams' in capturedOptions) || !capturedOptions.connectionParams) {
    throw new Error('connectionParams not captured');
  }
  return capturedOptions.connectionParams;
}

function shouldRetry() {
  if (!capturedOptions?.shouldRetry) throw new Error('shouldRetry not captured');
  return capturedOptions.shouldRetry;
}

beforeEach(() => {
  // ws-client holds a module-level singleton; drop any client a prior test left
  // BEFORE clearing mocks, so its teardown dispose() doesn't pollute disposeSpy.
  disposeWsClient();
  vi.clearAllMocks();
  mockGetAuthToken.mockResolvedValue('jwt-token');
  mockEnsureFreshToken.mockResolvedValue(true);
  mockDeduplicatedRefresh.mockResolvedValue(true);
  capturedOptions = null;
});

describe('getWsClient connectionParams', () => {
  it('refreshes a soon-to-expire token before reading it, then sends authToken', async () => {
    getWsClient();

    const params = await connectionParams()();

    expect(mockEnsureFreshToken).toHaveBeenCalledTimes(1);
    // The freshen must precede the token read so we connect with a live token.
    expect(mockEnsureFreshToken.mock.invocationCallOrder[0]).toBeLessThan(mockGetAuthToken.mock.invocationCallOrder[0]);
    expect(params).toEqual({ authToken: 'jwt-token' });
  });

  it('omits authToken when no token is stored', async () => {
    mockGetAuthToken.mockResolvedValue(null);
    getWsClient();

    const params = await connectionParams()();

    expect(params).toEqual({});
  });
});

describe('getWsClient shouldRetry', () => {
  it('retries non-auth close events without refreshing', () => {
    getWsClient();

    expect(shouldRetry()({ code: 1006 })).toBe(true);
    expect(shouldRetry()(new Error('socket hiccup'))).toBe(true);
    expect(mockDeduplicatedRefresh).not.toHaveBeenCalled();
  });

  it('does not retry a 4401 close, force-refreshes the token, and recreates the client', async () => {
    getWsClient();

    expect(shouldRetry()({ code: 4401 })).toBe(false);

    // The refresh + dispose run on a fired-and-forgotten async task.
    await vi.waitFor(() => expect(disposeSpy).toHaveBeenCalledTimes(1));
    expect(mockDeduplicatedRefresh).toHaveBeenCalledTimes(1);
    // ensureFreshToken (the expiry-gated path) would no-op for a revoked but
    // still-valid token; the 4401 branch must force the refresh.
    expect(mockEnsureFreshToken).not.toHaveBeenCalled();

    // After teardown the next getWsClient() builds a fresh client.
    capturedOptions = null;
    getWsClient();
    expect(capturedOptions).not.toBeNull();
  });

  it('refreshes once for a burst of 4401 closes (no reconnect storm)', async () => {
    // Hold the refresh open so all three closes land while the first is in flight.
    let releaseRefresh!: (value: boolean) => void;
    mockDeduplicatedRefresh.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        releaseRefresh = resolve;
      }),
    );
    getWsClient();
    const retry = shouldRetry();

    expect(retry({ code: 4401 })).toBe(false);
    expect(retry({ code: 4401 })).toBe(false);
    expect(retry({ code: 4401 })).toBe(false);

    releaseRefresh(true);
    await vi.waitFor(() => expect(disposeSpy).toHaveBeenCalledTimes(1));
    // One refresh and one teardown despite three closes.
    expect(mockDeduplicatedRefresh).toHaveBeenCalledTimes(1);
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it('allows a later, genuinely new auth failure to refresh again', async () => {
    getWsClient();
    shouldRetry()({ code: 4401 });
    await vi.waitFor(() => expect(disposeSpy).toHaveBeenCalledTimes(1));
    expect(mockDeduplicatedRefresh).toHaveBeenCalledTimes(1);

    // Next subscription rebuilds the client; a fresh 4401 must refresh again.
    getWsClient();
    shouldRetry()({ code: 4401 });
    await vi.waitFor(() => expect(disposeSpy).toHaveBeenCalledTimes(2));
    expect(mockDeduplicatedRefresh).toHaveBeenCalledTimes(2);
  });
});
