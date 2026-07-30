// @vitest-environment jsdom
//
// Covers the React wrapper itself (the factory's own behavior is in
// create-queue-mutations.test.ts): live-deps forwarding through the ref, the
// build-once memo, and the `ensureReady`-presence rebuild.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ClimbQueueItemInput } from '@boardsesh/shared-schema';
import { ADD_QUEUE_ITEM, SET_CURRENT_CLIMB } from '@boardsesh/graphql/operations/queue-session';

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

const noQueue = () => -1;

describe('useQueueMutations (React wrapper)', () => {
  it('keeps action identities stable across rerenders (factory built once)', () => {
    const deps: QueueMutationsDeps<TestItem> = {
      getClient: () => client,
      getSessionId: () => 'S',
      toQueueItemInput,
      getQueuePosition: noQueue,
    };
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
      getQueuePosition: noQueue,
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
      getQueuePosition: noQueue,
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

  it('forwards getQueuePosition LIVE through the ref, not captured at mount', async () => {
    // A deferred queue-add can fire long after mount, so a mount-time capture
    // would position it against a stale queue (#3936). Observed through the
    // only public surface that reads it: the coalescer's superseded queue-add.
    let firstResolve: (() => void) | undefined;
    let setCurrentCalls = 0;
    executeMock.mockImplementation((_c: unknown, op: { query: string }) => {
      if (op.query !== SET_CURRENT_CLIMB) return Promise.resolve();
      setCurrentCalls += 1;
      if (setCurrentCalls === 1)
        return new Promise<void>((resolve) => {
          firstResolve = () => resolve();
        });
      return Promise.resolve();
    });

    const mountDeps: QueueMutationsDeps<TestItem> = {
      getClient: () => client,
      getSessionId: () => 'S',
      toQueueItemInput,
      getQueuePosition: () => 1,
    };
    const { result, rerender } = renderMutations(mountDeps);
    // A later render brings a different local queue; the factory identity is
    // unchanged, so only ref-forwarding can pick this up.
    rerender({ ...mountDeps, getQueuePosition: () => 5 });

    const actions = result.current;
    const pA = actions.setCurrentClimb({ uuid: 'A', climb: { uuid: 'c-A' } }, true);
    const pB = actions.setCurrentClimb({ uuid: 'B', climb: { uuid: 'c-B' } }, true);
    const pC = actions.setCurrentClimb({ uuid: 'C', climb: { uuid: 'c-C' } }, true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const adds = executeMock.mock.calls.filter(([, op]) => op.query === ADD_QUEUE_ITEM);
    expect(adds).toHaveLength(1);
    expect(adds[0][1].variables).toEqual({ item: { uuid: 'B', climb: { uuid: 'c-B' } }, position: 5 });

    firstResolve?.();
    await Promise.all([pA, pB, pC]);
  });
});
