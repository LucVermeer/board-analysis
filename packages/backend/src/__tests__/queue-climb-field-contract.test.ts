import { describe, expect, it } from 'vite-plus/test';
import { parse, visit } from 'graphql';
import { typeDefs } from '@boardsesh/shared-schema';
import { ClimbInputSchema, ClimbQueueItemSchema } from '../validation/schemas/climbs';

/**
 * Drift guard for the queue climb boundary (#3927).
 *
 * A queue climb crosses several independently-maintained field lists on its way
 * from one client to another. When any one of them drifts, the field does not
 * merely go missing — it FLAPS. A peer whose read path omits a field rebuilds
 * the item without it, and that peer's next full-queue write pushes the gap back
 * to everyone, so the originator loses the field too on the following FullSync.
 * A flapping field is worse than a consistently absent one: it makes an Edit
 * button and a draft badge blink in and out depending on who touched the queue
 * last.
 *
 * Every list below is read from a LIVE source (the schema, the Zod shape, the
 * operation strings) rather than hand-transcribed here, so adding a sixth field
 * to one side only turns this red without anyone editing this file. That is the
 * whole point — a regression test pinned to today's field names would not have
 * stopped the drift that produced #3927 in the first place.
 */

/** Field names declared on a GraphQL input type, read from the schema. */
function inputTypeFieldNames(typeName: string): Set<string> {
  const fields = new Set<string>();
  visit(parse(typeDefs.join('\n\n')), {
    InputObjectTypeDefinition(node) {
      if (node.name.value !== typeName) return;
      for (const field of node.fields ?? []) fields.add(field.name.value);
    },
  });
  return fields;
}

const climbInputFields = inputTypeFieldNames('ClimbInput');

describe('queue climb field parity: GraphQL ClimbInput <-> backend Zod schema', () => {
  it('found the ClimbInput type in the schema', () => {
    expect(climbInputFields.size).toBeGreaterThan(0);
  });

  // `z.object()` STRIPS undeclared keys, and `setQueue` / `joinSession` persist
  // the PARSED item (the single-item mutations discard the parse result and keep
  // the GraphQL-coerced input, which is why this gap stayed invisible for so
  // long — it only bit on a full-queue sync). So any ClimbInput field missing
  // from the Zod shape is a field the server silently erases mid-session.
  it('the Zod ClimbInputSchema declares exactly the ClimbInput field set', () => {
    const zodFields = new Set(Object.keys(ClimbInputSchema.shape));
    const strippedByZod = [...climbInputFields].filter((field) => !zodFields.has(field));
    const unknownToSchema = [...zodFields].filter((field) => !climbInputFields.has(field));

    expect(
      strippedByZod,
      'ClimbInputSchema is missing these ClimbInput fields, so setQueue/joinSession will STRIP them ' +
        'and every peer loses them on the next FullSync. Add them to packages/backend/src/validation/schemas/climbs.ts.',
    ).toEqual([]);
    expect(
      unknownToSchema,
      'ClimbInputSchema declares fields the GraphQL ClimbInput does not, so they can never arrive. ' +
        'Either add them to packages/shared-schema/src/schema/climb.ts or drop them from the Zod schema.',
    ).toEqual([]);
  });

  // The behavioural counterpart: prove a fully-populated climb survives the
  // exact call `setQueue` makes, rather than only asserting on key lists.
  it('a fully-populated queue item survives the setQueue parse without losing a field', () => {
    const climb = {
      uuid: 'aurora-climb-uuid-fixture',
      boardType: 'kilter',
      layoutId: 1,
      setter_username: 'setter',
      userId: 'user-1',
      name: 'Proj Braj',
      description: 'crimpy',
      frames: 'p1086r15',
      angle: 40,
      ascensionist_count: 3,
      difficulty: 'V5',
      quality_average: '3.0',
      stars: 3,
      difficulty_error: '0.1',
      mirrored: true,
      benchmark_difficulty: null,
      is_no_match: true,
      characteristics: ['method_footless'],
      is_draft: false,
      published_at: '2026-07-01T00:00:00Z',
      userAscents: 2,
      userAttempts: 5,
      framesCount: 1,
      framesPace: 0,
      boardseshDifficulty: 19.2,
      boardseshConfidence: 'confirmed',
    };

    const parsed = ClimbQueueItemSchema.parse({ uuid: 'queue-slot-1', climb });

    expect(new Set(Object.keys(parsed.climb))).toEqual(climbInputFields);
    expect(parsed.climb).toMatchObject(climb);
  });

  // An unrecognised characteristic must NOT fail the item. `parseArrayTolerant`
  // drops the whole queue slot on a schema failure, so enum-validating this
  // field would let a newer client's unknown value silently delete a climb from
  // everyone's queue — the failure mode #3857 fixed for `uuid`.
  it('accepts an unknown characteristic rather than dropping the queue slot', () => {
    const result = ClimbQueueItemSchema.safeParse({
      uuid: 'queue-slot-1',
      climb: {
        uuid: 'aurora-climb-uuid-fixture',
        angle: 40,
        characteristics: ['some_characteristic_a_newer_client_invented'],
      },
    });

    expect(result.success).toBe(true);
  });
});
