import { describe, it, expect } from 'vite-plus/test';
import { buildSchema, parse, validate, type DocumentNode, type GraphQLSchema } from 'graphql';
import { typeDefs } from '@boardsesh/shared-schema';
import * as operations from '@boardsesh/shared-schema/operations';

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
  for (const [name, value] of Object.entries(operations)) {
    if (typeof value !== 'string') continue;
    if (!/^\s*(query|mutation|subscription)\b/i.test(value)) continue;
    operationEntries.push([name, value]);
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
