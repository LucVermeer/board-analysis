import { describe, it, expect } from 'vitest';
import { fnv1aHash, computeQueueStateHash, computeQueueStateHashOrdered } from '../state-hash';

describe('state-hash', () => {
  describe('fnv1aHash', () => {
    it('returns a consistent hash for the same input', () => {
      expect(fnv1aHash('test-string')).toBe(fnv1aHash('test-string'));
    });

    it('returns different hashes for different inputs', () => {
      expect(fnv1aHash('input-1')).not.toBe(fnv1aHash('input-2'));
    });

    it('returns an 8-character hex string', () => {
      expect(fnv1aHash('test')).toMatch(/^[0-9a-f]{8}$/);
    });

    it('handles the empty string', () => {
      expect(fnv1aHash('')).toMatch(/^[0-9a-f]{8}$/);
    });
  });

  describe('computeQueueStateHash', () => {
    it('returns a consistent hash for the same queue state', () => {
      const queue = [{ uuid: 'item-1' }, { uuid: 'item-2' }];
      expect(computeQueueStateHash(queue, 'item-1')).toBe(computeQueueStateHash(queue, 'item-1'));
    });

    it('returns a different hash when the queue changes', () => {
      const queue1 = [{ uuid: 'item-1' }, { uuid: 'item-2' }];
      const queue2 = [{ uuid: 'item-1' }, { uuid: 'item-3' }];
      expect(computeQueueStateHash(queue1, 'item-1')).not.toBe(computeQueueStateHash(queue2, 'item-1'));
    });

    it('returns a different hash when currentItemUuid changes', () => {
      const queue = [{ uuid: 'item-1' }, { uuid: 'item-2' }];
      expect(computeQueueStateHash(queue, 'item-1')).not.toBe(computeQueueStateHash(queue, 'item-2'));
    });

    it('returns the same hash regardless of queue order (sorted internally)', () => {
      const queue1 = [{ uuid: 'item-1' }, { uuid: 'item-2' }];
      const queue2 = [{ uuid: 'item-2' }, { uuid: 'item-1' }];
      expect(computeQueueStateHash(queue1, 'item-1')).toBe(computeQueueStateHash(queue2, 'item-1'));
    });

    it('handles a null currentItemUuid', () => {
      expect(computeQueueStateHash([{ uuid: 'item-1' }], null)).toMatch(/^[0-9a-f]{8}$/);
    });

    it('handles an empty queue', () => {
      expect(computeQueueStateHash([], 'item-1')).toMatch(/^[0-9a-f]{8}$/);
    });

    it('handles an empty queue with a null currentItemUuid', () => {
      expect(computeQueueStateHash([], null)).toMatch(/^[0-9a-f]{8}$/);
    });

    describe('corruption handling', () => {
      it('filters out null items from the queue', () => {
        const withNull = computeQueueStateHash([{ uuid: 'item-1' }, null, { uuid: 'item-2' }], 'item-1');
        const clean = computeQueueStateHash([{ uuid: 'item-1' }, { uuid: 'item-2' }], 'item-1');
        expect(withNull).toBe(clean);
      });

      it('filters out undefined items from the queue', () => {
        const withUndefined = computeQueueStateHash([{ uuid: 'item-1' }, undefined, { uuid: 'item-2' }], 'item-1');
        const clean = computeQueueStateHash([{ uuid: 'item-1' }, { uuid: 'item-2' }], 'item-1');
        expect(withUndefined).toBe(clean);
      });

      it('filters out items with a null uuid', () => {
        const withNullUuid = computeQueueStateHash(
          [{ uuid: 'item-1' }, { uuid: null as unknown as string }, { uuid: 'item-2' }],
          'item-1',
        );
        const clean = computeQueueStateHash([{ uuid: 'item-1' }, { uuid: 'item-2' }], 'item-1');
        expect(withNullUuid).toBe(clean);
      });

      it('filters out items with an undefined uuid', () => {
        const withUndefinedUuid = computeQueueStateHash(
          [{ uuid: 'item-1' }, { uuid: undefined as unknown as string }, { uuid: 'item-2' }],
          'item-1',
        );
        const clean = computeQueueStateHash([{ uuid: 'item-1' }, { uuid: 'item-2' }], 'item-1');
        expect(withUndefinedUuid).toBe(clean);
      });

      it('treats an all-corrupt queue as empty', () => {
        const allCorrupt = computeQueueStateHash([null, undefined, { uuid: null as unknown as string }], 'item-1');
        expect(allCorrupt).toBe(computeQueueStateHash([], 'item-1'));
      });

      it('does not throw on mixed valid and corrupt items', () => {
        const queue = [
          null,
          { uuid: 'item-1' },
          undefined,
          { uuid: 'item-2' },
          { uuid: null as unknown as string },
          { uuid: 'item-3' },
        ];
        expect(() => computeQueueStateHash(queue, 'item-1')).not.toThrow();
        expect(computeQueueStateHash(queue, 'item-1')).toMatch(/^[0-9a-f]{8}$/);
      });
    });

    // Regression for issue #2359: a queue item with a valid climb but a
    // missing/null uuid survives the reducer's `climb != null` filter. The web
    // and backend hash functions used to diverge on it (web filtered, backend
    // did not), so the client watchdog disagreed with the server forever and
    // refired no-op resyncs. Now a single shared implementation makes the hash
    // of the malformed queue identical to the clean one — both sides agree.
    describe('issue #2359 — malformed-uuid drift regression', () => {
      it('hashes a queue with a missing-uuid item identically to the clean queue', () => {
        const malformed = [
          { uuid: 'climb-a' },
          { climb: { name: 'no uuid here' } } as unknown as { uuid: string },
          { uuid: 'climb-b' },
        ];
        const clean = [{ uuid: 'climb-a' }, { uuid: 'climb-b' }];
        expect(computeQueueStateHash(malformed, 'climb-a')).toBe(computeQueueStateHash(clean, 'climb-a'));
      });

      it('does not throw on a literal null entry (the pre-fix backend crash)', () => {
        expect(() => computeQueueStateHash([null, { uuid: 'climb-a' }], 'climb-a')).not.toThrow();
      });
    });

    // Issue #2387 — the hash must be invariant to the SHAPE of a queue item, so
    // the server's full ClimbQueueItem (climb metadata, addedBy, angle, …) and a
    // client's slim `{ uuid }` item hash identically for equivalent state. The
    // hash consumes only `uuid`, so extra fields, differing key order, and
    // null-vs-undefined-vs-absent on non-uuid fields can never drift the two
    // sides. These lock that invariant in so a future refactor can't reintroduce
    // the cross-side drift the no-op-resync warning was blamed on.
    describe('issue #2387 — server-shaped vs client-shaped item equivalence', () => {
      // A rich "server-shaped" item as the backend stores/broadcasts it.
      const serverShaped = [
        {
          uuid: 'q-1',
          climb: { uuid: 'climb-1', name: 'Crimp Ladder', angle: 40, boardType: 'kilter', layoutId: 1 },
          addedBy: 'conn-abc',
          addedByUser: { id: 'user-9', username: 'marco' },
          suggested: false,
          tickedBy: null,
        },
        {
          uuid: 'q-2',
          climb: { uuid: 'climb-2', name: 'Sloper Traverse', angle: 40, boardType: 'kilter', layoutId: 1 },
          addedBy: undefined,
          suggested: true,
        },
      ] as unknown as Array<{ uuid: string }>;

      // The same queue as a client's slim `{ uuid }` shape.
      const clientShaped = [{ uuid: 'q-1' }, { uuid: 'q-2' }];

      it('hashes identically for v1 regardless of item shape', () => {
        expect(computeQueueStateHash(serverShaped, 'q-1')).toBe(computeQueueStateHash(clientShaped, 'q-1'));
      });

      it('hashes identically for v2 regardless of item shape', () => {
        expect(computeQueueStateHashOrdered(serverShaped, 'q-1')).toBe(
          computeQueueStateHashOrdered(clientShaped, 'q-1'),
        );
      });

      it('is invariant to key order and null-vs-undefined on non-uuid fields', () => {
        const reorderedKeys = [
          { addedBy: null, climb: { name: 'x' }, suggested: true, uuid: 'q-1' },
          { suggested: undefined, uuid: 'q-2', climb: undefined },
        ] as unknown as Array<{ uuid: string }>;
        expect(computeQueueStateHash(reorderedKeys, 'q-1')).toBe(computeQueueStateHash(clientShaped, 'q-1'));
        expect(computeQueueStateHashOrdered(reorderedKeys, 'q-1')).toBe(
          computeQueueStateHashOrdered(clientShaped, 'q-1'),
        );
      });
    });
  });

  describe('computeQueueStateHashOrdered (v2, order-sensitive)', () => {
    it('returns a consistent hash for the same queue state', () => {
      const queue = [{ uuid: 'item-1' }, { uuid: 'item-2' }];
      expect(computeQueueStateHashOrdered(queue, 'item-1')).toBe(computeQueueStateHashOrdered(queue, 'item-1'));
    });

    it('returns an 8-character hex string', () => {
      expect(computeQueueStateHashOrdered([{ uuid: 'item-1' }], 'item-1')).toMatch(/^[0-9a-f]{8}$/);
    });

    it('changes when currentItemUuid changes', () => {
      const queue = [{ uuid: 'item-1' }, { uuid: 'item-2' }];
      expect(computeQueueStateHashOrdered(queue, 'item-1')).not.toBe(computeQueueStateHashOrdered(queue, 'item-2'));
    });

    it('handles the empty queue and the single-item queue', () => {
      expect(computeQueueStateHashOrdered([], null)).toMatch(/^[0-9a-f]{8}$/);
      expect(computeQueueStateHashOrdered([], 'item-1')).toMatch(/^[0-9a-f]{8}$/);
      expect(computeQueueStateHashOrdered([{ uuid: 'only' }], 'only')).toMatch(/^[0-9a-f]{8}$/);
    });

    it('filters malformed entries identically to v1 (same lock-step corruption handling)', () => {
      const withNulls = computeQueueStateHashOrdered(
        [{ uuid: 'item-1' }, null, { uuid: null as unknown as string }, undefined, { uuid: 'item-2' }],
        'item-1',
      );
      const clean = computeQueueStateHashOrdered([{ uuid: 'item-1' }, { uuid: 'item-2' }], 'item-1');
      expect(withNulls).toBe(clean);
    });

    // The core reason v2 exists: a reorder that keeps membership is invisible
    // to v1 (sorted uuids) but MUST change v2 (uuids in order).
    it('CHANGES on a reorder that keeps the same members (v1 does NOT)', () => {
      const original = [{ uuid: 'item-1' }, { uuid: 'item-2' }, { uuid: 'item-3' }];
      const reordered = [{ uuid: 'item-2' }, { uuid: 'item-1' }, { uuid: 'item-3' }];

      // v1 is blind to the reorder (sorted internally)...
      expect(computeQueueStateHash(original, 'item-1')).toBe(computeQueueStateHash(reordered, 'item-1'));
      // ...v2 catches it.
      expect(computeQueueStateHashOrdered(original, 'item-1')).not.toBe(
        computeQueueStateHashOrdered(reordered, 'item-1'),
      );
    });

    it('changes for BOTH v1 and v2 on an add', () => {
      const before = [{ uuid: 'item-1' }, { uuid: 'item-2' }];
      const afterAdd = [{ uuid: 'item-1' }, { uuid: 'item-2' }, { uuid: 'item-3' }];

      expect(computeQueueStateHash(before, 'item-1')).not.toBe(computeQueueStateHash(afterAdd, 'item-1'));
      expect(computeQueueStateHashOrdered(before, 'item-1')).not.toBe(computeQueueStateHashOrdered(afterAdd, 'item-1'));
    });

    it('changes for BOTH v1 and v2 on a remove', () => {
      const before = [{ uuid: 'item-1' }, { uuid: 'item-2' }, { uuid: 'item-3' }];
      const afterRemove = [{ uuid: 'item-1' }, { uuid: 'item-3' }];

      expect(computeQueueStateHash(before, 'item-1')).not.toBe(computeQueueStateHash(afterRemove, 'item-1'));
      expect(computeQueueStateHashOrdered(before, 'item-1')).not.toBe(
        computeQueueStateHashOrdered(afterRemove, 'item-1'),
      );
    });
  });
});
