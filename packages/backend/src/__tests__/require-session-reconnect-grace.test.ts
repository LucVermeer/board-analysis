import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import type { ConnectionContext } from '@boardsesh/shared-schema';

// Unit test for the #2397 reconnect-grace guard. `getContext` (live
// per-connection context) and `getDistributedState` are the two signals the
// guard polls; mock both so we can drive the "JOIN hasn't landed yet, then
// lands" timeline deterministically without a socket. vi.hoisted keeps the mock
// fns available to the hoisted vi.mock factories (and typechecks cleanly).
const { getContextMock, getDistributedStateMock } = vi.hoisted(() => ({
  getContextMock: vi.fn(),
  getDistributedStateMock: vi.fn(),
}));

vi.mock('../graphql/context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../graphql/context')>()),
  getContext: getContextMock,
}));

vi.mock('../services/distributed-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/distributed-state')>()),
  getDistributedState: getDistributedStateMock,
}));

import { requireSessionWithReconnectGrace } from '../graphql/resolvers/shared/helpers';

const makeCtx = (sessionId: string | null): ConnectionContext =>
  ({ connectionId: 'conn-test', sessionId }) as unknown as ConnectionContext;

describe('requireSessionWithReconnectGrace (#2397)', () => {
  beforeEach(() => {
    getContextMock.mockReset();
    getDistributedStateMock.mockReset();
    getDistributedStateMock.mockReturnValue(null);
  });

  it('returns immediately when ctx.sessionId is already bound (no polling on the hot path)', async () => {
    const result = await requireSessionWithReconnectGrace(makeCtx('sess-hot'));
    expect(result).toBe('sess-hot');
    expect(getContextMock).not.toHaveBeenCalled();
  });

  it('resolves once JOIN binds the live per-connection context mid-wait', async () => {
    getContextMock
      .mockReturnValueOnce(undefined) // JOIN not landed yet
      .mockReturnValue({ connectionId: 'conn-test', sessionId: 'sess-joined' });

    const result = await requireSessionWithReconnectGrace(makeCtx(null), 4, 1);
    expect(result).toBe('sess-joined');
    expect(getContextMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('resolves via distributed state for a cross-instance connection', async () => {
    getContextMock.mockReturnValue(undefined);
    getDistributedStateMock.mockReturnValue({
      getConnection: vi.fn().mockResolvedValue({ sessionId: 'sess-cross' }),
    });

    const result = await requireSessionWithReconnectGrace(makeCtx(null), 4, 1);
    expect(result).toBe('sess-cross');
  });

  it('throws the same error as requireSession after the grace budget expires', async () => {
    getContextMock.mockReturnValue(undefined);
    getDistributedStateMock.mockReturnValue(null);

    await expect(requireSessionWithReconnectGrace(makeCtx(null), 3, 1)).rejects.toThrow(
      /Must be in a session to perform this operation/,
    );
  });

  it('keeps waiting through a transient distributed-state error rather than failing early', async () => {
    getContextMock
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(undefined)
      .mockReturnValue({ connectionId: 'conn-test', sessionId: 'sess-after-blip' });
    getDistributedStateMock.mockReturnValue({
      getConnection: vi.fn().mockRejectedValueOnce(new Error('redis blip')).mockResolvedValue(null),
    });

    const result = await requireSessionWithReconnectGrace(makeCtx(null), 4, 1);
    expect(result).toBe('sess-after-blip');
  });
});
