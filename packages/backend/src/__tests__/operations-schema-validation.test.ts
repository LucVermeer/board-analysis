import { describe, it, expect } from 'vite-plus/test';
import { readFileSync } from 'fs';
import { buildSchema, parse, validate, type DocumentNode, type GraphQLSchema } from 'graphql';
import { typeDefs } from '@boardsesh/shared-schema';
import * as publicOperations from '@boardsesh/graphql/operations';
import * as accountOperations from '@boardsesh/graphql/operations/account';
import * as proposalOperations from '@boardsesh/graphql/operations/proposals';
import * as queueSessionOperations from '@boardsesh/graphql/operations/queue-session';

// Build a fresh schema from the raw typeDefs inside this test's `graphql`
// instance. Importing the backend's `schema` object crosses the boundary
// between two installed `graphql` modules (the backend builds with one,
// `validate()` uses another), which graphql-js rejects with "Cannot use
// GraphQLSchema ...". Building locally keeps everything in one module.
let schema: GraphQLSchema;
try {
  schema = buildSchema(typeDefs.join('\n\n'));
} catch (error) {
  throw new Error(`Failed to build schema from shared-schema typeDefs: ${(error as Error).message}`);
}

function normalizeGraphQLOperation(source: string): string {
  return source.replace(/\s+/g, ' ').trim();
}

function readNativeIosQueueUpdatesOperation(): string {
  const sessionWebSocketManagerSource = readFileSync(
    new URL('../../../../packages/mobile/modules/live-activity/ios/SessionWebSocketManager.swift', import.meta.url),
    'utf-8',
  );
  const queryMatch = sessionWebSocketManagerSource.match(
    /private func sendSubscription\(\) \{[\s\S]*?let query = """\n([\s\S]*?)\n\s*"""/,
  );

  if (!queryMatch?.[1]) {
    throw new Error('Could not extract native iOS queue subscription query from SessionWebSocketManager.swift');
  }

  return queryMatch[1];
}

/**
 * Guard against the OverlappingFieldsCanBeMergedRule (and any other) GraphQL
 * validation regression that broke production twice:
 *   1. PR #2128 added `uuid: ID` to `ClimbMirrored` while sibling union arms
 *      declared `uuid: ID!`. Every party-session join failed validation, the
 *      client tight-looped reconnects, and the PR had to be reverted.
 *   2. The reland reintroduced the same hazard at first and would have hit
 *      prod again without manual catching.
 *
 * The graphql-js validator catches both classes of bug deterministically when
 * run against the schema. Run every exported `*_OPERATION` string in
 * `operations.ts` through `parse()` + `validate(schema, doc)` and assert no
 * errors. One ~10ms unit test is cheap insurance.
 */
describe('shared-schema operations validate against the executable schema', () => {
  // Pull every exported value that looks like a GraphQL operation string.
  // operations.ts uses plain template-literal strings (not gql tags), so we
  // duck-type by checking it starts with `mutation`/`query`/`subscription`
  // after optional whitespace.
  const operationEntries: Array<[string, string]> = [];
  const operationModules = [
    ['operations', publicOperations],
    ['operations/account', accountOperations],
    ['operations/proposals', proposalOperations],
    ['operations/queue-session', queueSessionOperations],
  ] as const;

  for (const [moduleName, moduleOperations] of operationModules) {
    for (const [name, value] of Object.entries(moduleOperations)) {
      if (typeof value !== 'string') continue;
      if (!/^\s*(query|mutation|subscription)\b/i.test(value)) continue;
      operationEntries.push([`${moduleName}.${name}`, value]);
    }
  }

  it('found at least one exported operation to validate', () => {
    expect(operationEntries.length).toBeGreaterThan(0);
  });

  for (const [name, source] of operationEntries) {
    it(`${name} parses and validates against the schema`, () => {
      let document: DocumentNode;
      try {
        document = parse(source);
      } catch (error) {
        throw new Error(`Operation ${name} failed to parse: ${(error as Error).message}`);
      }

      const errors = validate(schema, document);
      if (errors.length > 0) {
        const detail = errors.map((e, i) => `  ${i + 1}. ${e.message}`).join('\n');
        throw new Error(`Operation ${name} has GraphQL validation errors:\n${detail}`);
      }
    });
  }
});

describe('native iOS queue subscription drift guard', () => {
  it('matches the shared-schema native queue operation exactly after whitespace normalization', () => {
    const nativeOperation = readNativeIosQueueUpdatesOperation();

    expect(normalizeGraphQLOperation(nativeOperation)).toBe(
      normalizeGraphQLOperation(queueSessionOperations.NATIVE_IOS_QUEUE_UPDATES),
    );
  });
});

// Workstream B7 (reduced variant, 2026-07) removed ONLY the takeControl/releaseControl
// mutations. Session.driverParticipantId, the DriverChanged type, and its SessionEvent
// union membership are DEFERRED: telemetry found a real tail of stale mobile JS bundles
// (~15-20 users/14d) whose JoinSession documents still select driverParticipantId and
// whose sessionUpdates subscriptions still contain `... on DriverChanged`. Whole-document
// GraphQL validation means removing those would break the ENTIRE document (join, or the
// whole subscription) for those clients — a much bigger blast radius than a single unknown
// mutation failing on its own. The removed mutations were NOT pure no-ops: takeControl
// with a `climb` argument still propagated that climb via setCurrentClimbAndPublish, and
// stale bundles' party-mode lightbulb press routed through it — those users now lose the
// go-live gesture in party mode (their client's catch handler rolls back and resyncs;
// join and subscriptions are unaffected). That degradation is an accepted,
// telemetry-bounded trade-off (coordinator ruling, reduced-B7): the cohort is a shrinking
// stale-bundle tail whose fix is one app open (OTA).
//
// This is the safety contract of the reduced variant, made explicit as an assertion split:
//   - legacy JoinSession / SessionUpdates documents (driverParticipantId, DriverChanged)
//     must STILL validate — those types were not touched.
//   - legacy TakeControl / ReleaseControl documents must NOW fail validation — those
//     mutations are gone.
describe('previous-release driver operations: reduced-B7 validation split', () => {
  const stillValidLegacyOperations: Array<[string, string]> = [
    [
      'legacy JoinSession selecting driverParticipantId',
      `mutation JoinSession($sessionId: ID!, $boardPath: String!) {
        joinSession(sessionId: $sessionId, boardPath: $boardPath) {
          id
          participantId
          isLeader
          driverParticipantId
        }
      }`,
    ],
    [
      'legacy SessionUpdates subscription with DriverChanged fragment',
      `subscription SessionUpdates($sessionId: ID!) {
        sessionUpdates(sessionId: $sessionId) {
          __typename
          ... on DriverChanged {
            driverParticipantId
            previousDriverParticipantId
          }
          ... on WallConfirmedClimb {
            climbUuid
          }
        }
      }`,
    ],
  ];

  for (const [name, source] of stillValidLegacyOperations) {
    it(`${name} still validates against the schema (driver type removal is deferred)`, () => {
      const document = parse(source);
      const errors = validate(schema, document);
      if (errors.length > 0) {
        const detail = errors.map((error, index) => `  ${index + 1}. ${error.message}`).join('\n');
        throw new Error(`Legacy operation "${name}" must keep validating (deferred removal) but errored:\n${detail}`);
      }
      expect(errors).toHaveLength(0);
    });
  }

  const nowInvalidLegacyOperations: Array<[string, string]> = [
    [
      'legacy TakeControl mutation',
      `mutation TakeControl($climb: ClimbQueueItemInput) {
        takeControl(climb: $climb) {
          id
          driverParticipantId
        }
      }`,
    ],
    [
      'legacy ReleaseControl mutation',
      `mutation ReleaseControl {
        releaseControl {
          id
          driverParticipantId
        }
      }`,
    ],
  ];

  for (const [name, source] of nowInvalidLegacyOperations) {
    it(`${name} now fails validation (mutation removed by reduced-B7)`, () => {
      const document = parse(source);
      const errors = validate(schema, document);
      // Pin the failure reason: it must be the removed mutation field itself, not an
      // incidental error elsewhere in the document (e.g. driverParticipantId, which
      // deliberately still validates).
      const unknownMutationErrors = errors.filter((error) =>
        /Cannot query field "(takeControl|releaseControl)"/.test(error.message),
      );
      expect(unknownMutationErrors.length).toBeGreaterThan(0);
    });
  }
});
