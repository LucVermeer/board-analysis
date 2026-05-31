// @vitest-environment jsdom
//
// Covers the React wrapper itself (the factory's own behavior is in
// create-queue-mutations.test.ts): live-deps forwarding through the ref, the
// build-once memo, and the `ensureReady`-presence rebuild.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ClimbQueueItemInput } from '@boardsesh/shared-schema';

const { executeMock } = vi.hoisted(() => ({ executeMock: vi.fn() }));
vi.mock('@boardsesh/graphql-client', () => ({ execute: executeMock }));

import { useQueueMutations } from '../use-queue-mutations';
import type { QueueMutationsDeps } from '../create-queue-mutations';

type TestItem = { uuid: string; climb: { uuid: string } };
const toQueueItemInput = (it: TestItem) => ({ uuid: it.uuid, climb: it.climb }) as unknown as ClimbQueueItemInput;
const client = {} as never;

const renderMutations = (deps: QueueMutationsDeps<TestItem>) =>
  renderHook((props: QueueMutationsDeps<TestItem>) => useQueueMutations(props), { initialProps: deps });

beforeEach(() => {
  executeMock.mockReset();
  executeMock.mockResolvedValue(undefined);
});

describe('useQueueMutations (React wrapper)', () => {
  it('keeps action identities stable across rerenders (factory built once)', () => {
    const deps: QueueMutationsDeps<TestItem> = { getClient: () => client, getSessionId: () => 'S', toQueueItemInput };
    const { result, rerender } = renderMutations(deps);
    const first = result.current;
    rerender({ ...deps });
    expect(result.current).toBe(first);
  });

  it('reads live deps through the ref without rebuilding (latest getSessionId wins)', async () => {
    let sessionId: string | null = null;
    const deps: QueueMutationsDeps<TestItem> = {
      getClient: () => client,
      getSessionId: () => sessionId,
      toQueueItemInput,
    };
    const { result, rerender } = renderMutations(deps);
    const actions = result.current;

    // Web semantics, disconnected -> throws.
    await expect(actions.removeQueueItem('x')).rejects.toThrow('Not connected to session');

    // Session becomes live; same action identity, new behavior.
    sessionId = 'S';
    rerender({ ...deps });
    expect(result.current).toBe(actions);
    await result.current.removeQueueItem('x');
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it('rebuilds the factory when ensureReady presence changes (throw -> no-op)', async () => {
    const base: QueueMutationsDeps<TestItem> = {
      getClient: () => client,
      getSessionId: () => null,
      toQueueItemInput,
    };
    const { result, rerender } = renderMutations(base);
    const webActions = result.current;

    // No ensureReady: a disconnected core action throws.
    await expect(webActions.removeQueueItem('x')).rejects.toThrow('Not connected to session');

    // Adding ensureReady flips presence -> the memo key changes -> rebuild.
    rerender({ ...base, ensureReady: async () => null });
    expect(result.current).not.toBe(webActions);

    // Mobile semantics now: the same disconnected action silently no-ops.
    await expect(result.current.removeQueueItem('x')).resolves.toBeUndefined();
    expect(executeMock).not.toHaveBeenCalled();
  });
});
