import { describe, expect, it } from 'vite-plus/test';
import { v4 as uuidv4 } from 'uuid';
import { ClimbQueueItemSchema } from '../validation/schemas/climbs';
import { parseArrayTolerant } from '../validation/schemas/primitives';

// Minimal valid `climb` payload — everything but `uuid`/`angle` is `.nullish()`
// with a default transform in ClimbInputSchema, so this is enough to isolate
// the wrapper `uuid` field under test.
const minimalClimb = { uuid: 'aurora-climb-uuid-fixture', angle: 40 };

const buildQueueItem = (uuid: string) => ({ uuid, climb: minimalClimb });

describe('ClimbQueueItemSchema.uuid (issue #3857)', () => {
  it('accepts a standard v4 uuid (current web/mobile id generation)', () => {
    const result = ClimbQueueItemSchema.safeParse(buildQueueItem(uuidv4()));
    expect(result.success).toBe(true);
  });

  it('accepts an Aurora-style 32-char uuid without dashes (PR #419 precedent)', () => {
    const result = ClimbQueueItemSchema.safeParse(buildQueueItem('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'));
    expect(result.success).toBe(true);
  });

  it('accepts the transient playlist-peek synthetic id (@boardsesh/queue playlist-suggestions.ts)', () => {
    // 9 ("playlist-peek:") + 36 (a v4 uuid) = 46 chars, under the 50-char cap.
    const result = ClimbQueueItemSchema.safeParse(buildQueueItem(`playlist-peek:${uuidv4()}`));
    expect(result.success).toBe(true);
  });

  it('accepts a 50-char id at the exact upper bound', () => {
    const result = ClimbQueueItemSchema.safeParse(buildQueueItem('a'.repeat(50)));
    expect(result.success).toBe(true);
  });

  it('rejects an empty-string uuid', () => {
    const result = ClimbQueueItemSchema.safeParse(buildQueueItem(''));
    expect(result.success).toBe(false);
  });

  it('rejects a uuid over the 50-char cap', () => {
    const result = ClimbQueueItemSchema.safeParse(buildQueueItem('a'.repeat(51)));
    expect(result.success).toBe(false);
  });

  it('rejects a missing uuid field entirely', () => {
    const result = ClimbQueueItemSchema.safeParse({ climb: minimalClimb });
    expect(result.success).toBe(false);
  });
});

describe('parseArrayTolerant (issue #3857)', () => {
  it('keeps every item and reports zero drops when the whole array is valid', () => {
    const queue = [buildQueueItem(uuidv4()), buildQueueItem(uuidv4()), buildQueueItem(uuidv4())];
    const { items, droppedCount } = parseArrayTolerant(ClimbQueueItemSchema, queue, 'queue', 500);
    expect(items).toHaveLength(3);
    expect(droppedCount).toBe(0);
  });

  it('drops only the malformed items and keeps the valid ones, reporting an accurate count', () => {
    const valid1 = buildQueueItem(uuidv4());
    const valid2 = buildQueueItem(uuidv4());
    const malformedEmptyUuid = buildQueueItem('');
    const malformedNoClimb = { uuid: uuidv4() };

    const { items, droppedCount } = parseArrayTolerant(
      ClimbQueueItemSchema,
      [valid1, malformedEmptyUuid, valid2, malformedNoClimb],
      'queue',
      500,
    );

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.uuid).sort()).toEqual([valid1.uuid, valid2.uuid].sort());
    expect(droppedCount).toBe(2);
  });

  it('throws (rejects the whole batch) when the raw array exceeds the length cap, even before per-item validation', () => {
    const oversized = Array.from({ length: 6 }, () => buildQueueItem(uuidv4()));
    expect(() => parseArrayTolerant(ClimbQueueItemSchema, oversized, 'queue', 5)).toThrow(/Invalid queue/);
  });

  it('throws when the top-level input is not an array at all', () => {
    expect(() => parseArrayTolerant(ClimbQueueItemSchema, 'not-an-array', 'queue', 500)).toThrow(/Invalid queue/);
  });
});
