/**
 * Unit coverage for `PubSubChannel` (pubsub/channel.ts) — the generic
 * subscribe/publish/fan-in mechanics factored out of the six copy-pasted
 * PubSub triplets (queue, session, notification, comment, new-climb,
 * board-presence). These tests exercise the channel in isolation, with fake
 * `redisSubscribe`/`redisUnsubscribe`/`redisPublish` deps injected directly —
 * no real Redis needed. Domain-specific behavior (event buffering, APNs
 * hooks, board-presence KV helpers) lives outside this class and is covered
 * by the existing domain-level suites (event-replay-buffer.test.ts,
 * board-presence.test.ts, redis-pubsub.test.ts).
 */
import { describe, it, expect, vi } from 'vite-plus/test';
import { PubSubChannel, type ChannelLogger } from '../pubsub/channel';

// `winston`'s `Logger.error` is an overloaded `LeveledLogMethod`, which a plain
// `vi.fn()` doesn't structurally satisfy — build the mock as its own shape and
// cast to `ChannelLogger` at the injection site instead of fighting the overload.
type MockLogger = { error: ReturnType<typeof vi.fn> };

function makeLogger(): MockLogger {
  return { error: vi.fn() };
}

function asChannelLogger(mockLogger: MockLogger): ChannelLogger {
  return mockLogger as unknown as ChannelLogger;
}

type TestEvent = { kind: string; value: number };

describe('PubSubChannel', () => {
  describe('subscribe() — first-subscribe / last-unsubscribe Redis semantics', () => {
    it('calls redisSubscribe only for the first subscriber on a key', async () => {
      const redisSubscribe = vi.fn().mockResolvedValue(undefined);
      const channel = new PubSubChannel<TestEvent>({
        label: 'test',
        redisSubscribe,
        isRedisRequired: () => false,
        logger: asChannelLogger(makeLogger()),
      });

      const unsubscribe1 = await channel.subscribe('key-a', () => {});
      expect(redisSubscribe).toHaveBeenCalledTimes(1);
      expect(redisSubscribe).toHaveBeenCalledWith('key-a');

      // Second subscriber on the same key must not trigger another Redis subscribe.
      const unsubscribe2 = await channel.subscribe('key-a', () => {});
      expect(redisSubscribe).toHaveBeenCalledTimes(1);

      unsubscribe1();
      unsubscribe2();
    });

    it('calls redisSubscribe again for a different key (independent per-key state)', async () => {
      const redisSubscribe = vi.fn().mockResolvedValue(undefined);
      const channel = new PubSubChannel<TestEvent>({
        label: 'test',
        redisSubscribe,
        isRedisRequired: () => false,
        logger: asChannelLogger(makeLogger()),
      });

      await channel.subscribe('key-a', () => {});
      await channel.subscribe('key-b', () => {});

      expect(redisSubscribe).toHaveBeenCalledTimes(2);
      expect(redisSubscribe).toHaveBeenCalledWith('key-a');
      expect(redisSubscribe).toHaveBeenCalledWith('key-b');
    });

    it('calls redisUnsubscribe only when the last subscriber for a key leaves', async () => {
      const redisUnsubscribe = vi.fn().mockResolvedValue(undefined);
      const channel = new PubSubChannel<TestEvent>({
        label: 'test',
        redisSubscribe: () => Promise.resolve(),
        redisUnsubscribe,
        isRedisRequired: () => false,
        logger: asChannelLogger(makeLogger()),
      });

      const unsubscribe1 = await channel.subscribe('key-a', () => {});
      const unsubscribe2 = await channel.subscribe('key-a', () => {});

      unsubscribe1();
      expect(redisUnsubscribe).not.toHaveBeenCalled();

      unsubscribe2();
      // redisUnsubscribe is fire-and-forget; flush microtasks.
      await Promise.resolve();
      expect(redisUnsubscribe).toHaveBeenCalledTimes(1);
      expect(redisUnsubscribe).toHaveBeenCalledWith('key-a');
    });

    it('a double unsubscribe is a no-op and cannot strand the remaining subscriber', async () => {
      // Pins Set-based (idempotent) removal: a future counter-based refactor
      // that decremented twice on a repeated unsubscribe would tear down the
      // Redis subscription while subscriber B is still listening.
      const redisUnsubscribe = vi.fn().mockResolvedValue(undefined);
      const channel = new PubSubChannel<TestEvent>({
        label: 'test',
        redisSubscribe: () => Promise.resolve(),
        redisUnsubscribe,
        isRedisRequired: () => false,
        logger: asChannelLogger(makeLogger()),
      });

      const unsubscribeA = await channel.subscribe('key-a', () => {});
      const unsubscribeB = await channel.subscribe('key-a', () => {});

      unsubscribeA();
      unsubscribeA();
      await Promise.resolve();
      expect(redisUnsubscribe).not.toHaveBeenCalled();
      expect(channel.count('key-a')).toBe(1);

      unsubscribeB();
      await Promise.resolve();
      expect(redisUnsubscribe).toHaveBeenCalledTimes(1);
      expect(channel.count('key-a')).toBe(0);
    });

    it('re-triggers redisSubscribe if all subscribers left and a new one joins', async () => {
      const redisSubscribe = vi.fn().mockResolvedValue(undefined);
      const channel = new PubSubChannel<TestEvent>({
        label: 'test',
        redisSubscribe,
        redisUnsubscribe: () => Promise.resolve(),
        isRedisRequired: () => false,
        logger: asChannelLogger(makeLogger()),
      });

      const unsubscribe = await channel.subscribe('key-a', () => {});
      unsubscribe();
      await channel.subscribe('key-a', () => {});

      expect(redisSubscribe).toHaveBeenCalledTimes(2);
    });

    it('does not blow up when redisSubscribe/redisUnsubscribe are omitted (pure local channel)', async () => {
      const channel = new PubSubChannel<TestEvent>({
        label: 'test',
        isRedisRequired: () => false,
        logger: asChannelLogger(makeLogger()),
      });

      const unsubscribe = await channel.subscribe('key-a', () => {});
      expect(channel.count('key-a')).toBe(1);
      unsubscribe();
      expect(channel.count('key-a')).toBe(0);
    });
  });

  describe('subscribe() — redisRequired throw semantics', () => {
    it('throws and rolls back the subscriber when redisSubscribe fails and Redis is required', async () => {
      const redisSubscribe = vi.fn().mockRejectedValue(new Error('redis down'));
      const logger = makeLogger();
      const channel = new PubSubChannel<TestEvent>({
        label: 'test',
        redisSubscribe,
        isRedisRequired: () => true,
        logger: asChannelLogger(logger),
      });

      await expect(channel.subscribe('key-a', () => {})).rejects.toThrow('redis down');
      // The failed subscriber must be rolled back, not left registered.
      expect(channel.count('key-a')).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('[PubSub] Failed to subscribe'));
    });

    it('swallows the error (does not throw) when redisSubscribe fails and Redis is not required', async () => {
      const redisSubscribe = vi.fn().mockRejectedValue(new Error('redis down'));
      const logger = makeLogger();
      const channel = new PubSubChannel<TestEvent>({
        label: 'test',
        redisSubscribe,
        isRedisRequired: () => false,
        logger: asChannelLogger(logger),
      });

      // The subscriber is still rolled back on a failed Redis subscribe — the
      // `isRedisRequired` flag only controls whether the error is rethrown,
      // not whether the local-only fallback keeps the registration.
      await expect(channel.subscribe('key-a', () => {})).resolves.toBeInstanceOf(Function);
      expect(channel.count('key-a')).toBe(0);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('publish() — local-first ordering', () => {
    it('dispatches to local subscribers before calling redisPublish', async () => {
      const callOrder: string[] = [];
      const redisPublish = vi.fn().mockImplementation(() => {
        callOrder.push('redis');
        return Promise.resolve();
      });
      const channel = new PubSubChannel<TestEvent>({
        label: 'test',
        redisPublish,
        isRedisRequired: () => false,
        logger: asChannelLogger(makeLogger()),
      });

      await channel.subscribe('key-a', () => {
        callOrder.push('local');
      });

      channel.publish('key-a', { kind: 'ping', value: 1 });

      expect(callOrder[0]).toBe('local');
      expect(redisPublish).toHaveBeenCalledWith('key-a', { kind: 'ping', value: 1 });
    });

    it('logs but does not throw when redisPublish rejects', async () => {
      const logger = makeLogger();
      const channel = new PubSubChannel<TestEvent>({
        label: 'test',
        redisPublish: () => Promise.reject(new Error('publish failed')),
        isRedisRequired: () => true,
        logger: asChannelLogger(logger),
      });

      expect(() => channel.publish('key-a', { kind: 'ping', value: 1 })).not.toThrow();
      await Promise.resolve();
      await Promise.resolve();
      expect(logger.error).toHaveBeenCalledWith('[PubSub] Redis test publish failed:', expect.any(Error));
    });
  });

  describe('publish() / dispatchLocal() — per-callback error isolation', () => {
    it('isolates a throwing subscriber so other subscribers still receive the event', async () => {
      const logger = makeLogger();
      const channel = new PubSubChannel<TestEvent>({
        label: 'test',
        isRedisRequired: () => false,
        logger: asChannelLogger(logger),
      });

      const received: TestEvent[] = [];
      await channel.subscribe('key-a', () => {
        throw new Error('boom');
      });
      await channel.subscribe('key-a', (event) => received.push(event));

      expect(() => channel.publish('key-a', { kind: 'ping', value: 1 })).not.toThrow();
      expect(received).toEqual([{ kind: 'ping', value: 1 }]);
      expect(logger.error).toHaveBeenCalledWith('Error in test subscriber:', expect.any(Error));
    });
  });

  describe('dispatchLocal() — Redis fan-in path does not re-publish', () => {
    it('dispatches to local subscribers without calling redisPublish', async () => {
      const redisPublish = vi.fn().mockResolvedValue(undefined);
      const channel = new PubSubChannel<TestEvent>({
        label: 'test',
        redisPublish,
        isRedisRequired: () => false,
        logger: asChannelLogger(makeLogger()),
      });

      const received: TestEvent[] = [];
      await channel.subscribe('key-a', (event) => received.push(event));

      channel.dispatchLocal('key-a', { kind: 'fanned-in', value: 2 });

      expect(received).toEqual([{ kind: 'fanned-in', value: 2 }]);
      expect(redisPublish).not.toHaveBeenCalled();
    });
  });

  describe('count()', () => {
    it('returns 0 for an unknown key and the live subscriber count for a known key', async () => {
      const channel = new PubSubChannel<TestEvent>({
        label: 'test',
        isRedisRequired: () => false,
        logger: asChannelLogger(makeLogger()),
      });

      expect(channel.count('unknown')).toBe(0);

      const unsubscribe1 = await channel.subscribe('key-a', () => {});
      await channel.subscribe('key-a', () => {});
      expect(channel.count('key-a')).toBe(2);

      unsubscribe1();
      expect(channel.count('key-a')).toBe(1);
    });
  });
});
