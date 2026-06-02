#!/usr/bin/env node
/**
 * After `next build`, assert that the SWC client-preset plugin actually
 * tree-shook the gql.ts Documents map. A wrong `artifactDirectory` in
 * next.config.mjs (or a missing plugin entirely) silently no-ops the
 * transform, so we need a positive check.
 *
 * Strategy:
 *   1. Auto-discover every file under packages/shared/graphql/src/operations/
 *      that imports `graphql` from the generated module — these are the live
 *      graphql() call sites whose operations are *supposed* to be bundled.
 *      Operations that use `gql` from graphql-request don't go through the
 *      Documents map, so if none use graphql() there is nothing to verify and
 *      the check is a no-op (it re-activates automatically once any migrate).
 *   2. Parse generated/gql.ts for every operation name in the project.
 *   3. The set difference is must-be-absent: operations that should NOT
 *      appear in any chunk that holds a live operation.
 *   4. Walk static/chunks/ recursively, find chunks containing any live
 *      operation name, and assert no must-be-absent name leaks in.
 *
 * As more files migrate to graphql(), step 1 picks them up automatically.
 *
 * Operation names survive bundling as string literals inside the parsed
 * Document AST (e.g. `name:{kind:"Name",value:"GetBetaLinks"}`), even
 * though the *Document import identifiers get minified.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');
const repoRoot = join(webRoot, '..', '..');
const chunksDir = join(webRoot, '.next', 'static', 'chunks');
const gqlPath = join(repoRoot, 'packages', 'shared', 'graphql', 'src', 'generated', 'gql.ts');
const operationsDir = join(repoRoot, 'packages', 'shared', 'graphql', 'src', 'operations');

function fail(message: string): never {
  console.error(`verify-graphql-treeshake: ${message}`);
  process.exit(1);
}

function extractOperationNames(source: string): string[] {
  // Matches `query Name`, `mutation Name`, and `subscription Name` inside
  // graphql template literals. Captures the identifier only.
  const matches = source.matchAll(/\b(?:query|mutation|subscription)\s+([A-Z]\w+)/g);
  return [...new Set(Array.from(matches, (m) => m[1]))];
}

if (!existsSync(operationsDir) || !statSync(operationsDir).isDirectory()) {
  fail(`operations directory not found at ${operationsDir}`);
}

const operationFileNames = readdirSync(operationsDir).filter((name) => name.endsWith('.ts'));
if (operationFileNames.length === 0) {
  fail(`no TypeScript operation files found under ${operationsDir}`);
}

// Discover graphql() call sites: any file in operations/ that imports the
// `graphql` helper from the generated module is in scope. Files that use
// `gql` from `graphql-request` are not — their operations don't go through
// the Documents map.
const operationNamesByFile: Record<string, string[]> = {};
const liveOperationsByFile: Record<string, string[]> = {};
for (const name of operationFileNames) {
  const path = join(operationsDir, name);
  const source = readFileSync(path, 'utf8');
  const names = extractOperationNames(source);
  if (names.length > 0) {
    operationNamesByFile[name] = names;
  }
  if (!/import\s*\{[^}]*\bgraphql\b[^}]*\}\s*from\s*['"][^'"]*graphql\/generated/.test(source)) {
    continue;
  }
  if (names.length > 0) {
    liveOperationsByFile[name] = names;
  }
}
const discoveredOperationNames = [...new Set(Object.values(operationNamesByFile).flat())];
if (discoveredOperationNames.length === 0) {
  fail(`no GraphQL operations found under ${operationsDir}; check operation discovery configuration`);
}
const liveOperationNames = [...new Set(Object.values(liveOperationsByFile).flat())];

if (liveOperationNames.length === 0) {
  // No operation uses the typed graphql() helper (they use `gql` from
  // graphql-request), so the Documents map has no live call site to bundle and
  // there is nothing to tree-shake-verify. Pass cleanly rather than failing;
  // this re-arms automatically if any operation migrates to graphql().
  console.info(
    `verify-graphql-treeshake: skipped — no graphql() call sites under ${operationsDir} ` +
      `(operations use gql from graphql-request); nothing to verify.`,
  );
  process.exit(0);
}

const allOperationNames = extractOperationNames(readFileSync(gqlPath, 'utf8'));
const mustBeAbsent = allOperationNames.filter((name) => !liveOperationNames.includes(name));

if (mustBeAbsent.length === 0) {
  fail(`no candidate operations to verify against; every operation in gql.ts is live in operations/`);
}

// Recursive: Next App Router can split chunks into per-route subdirectories
// (e.g. .next/static/chunks/app/...) depending on version and routing config.
let chunkNames: string[];
try {
  chunkNames = readdirSync(chunksDir, { recursive: true })
    .map((entry) => (typeof entry === 'string' ? entry : entry.toString()))
    .filter((name) => name.endsWith('.js'));
} catch {
  fail(`chunks directory not found at ${chunksDir}; run \`vp run build:web\` first`);
}

const chunkContent = new Map<string, string>();
function read(name: string): string {
  let content = chunkContent.get(name);
  if (content === undefined) {
    content = readFileSync(join(chunksDir, name), 'utf8');
    chunkContent.set(name, content);
  }
  return content;
}

// In bundled output, operation names appear inside the parsed Document AST
// as `value:"<Name>"`. Matching that exact pattern (rather than a bare
// substring) avoids collisions with unrelated identifiers — e.g. the
// generated TypeScript type `DeleteAccountInput` would match a substring
// search for `DeleteAccount` but is not a graphql operation.
const opPattern = (name: string): string => `value:"${name}"`;

// A chunk is a "live chunk" if it contains *any* live operation name. We
// search by all of them rather than picking a single anchor — that way a
// future split of operations across multiple files still produces the
// right marker set without code changes.
const liveChunks = chunkNames.filter((name) => {
  const content = read(name);
  return liveOperationNames.some((op) => content.includes(opPattern(op)));
});

if (liveChunks.length === 0) {
  fail(
    `no chunk contains any of [${liveOperationNames.join(', ')}] as a parsed operation; ` +
      `operations may not have been bundled — did the build complete?`,
  );
}

const leaks: { chunk: string; size: number; queries: string[] }[] = [];
for (const name of liveChunks) {
  const content = read(name);
  const queries = mustBeAbsent.filter((q) => content.includes(opPattern(q)));
  if (queries.length > 0) {
    leaks.push({ chunk: name, size: statSync(join(chunksDir, name)).size, queries });
  }
}

if (leaks.length > 0) {
  console.error('SWC plugin transform did not fire — Documents map leaked into live chunk(s):');
  for (const { chunk, size, queries } of leaks) {
    const shown = queries.slice(0, 5).join(', ');
    const extra = queries.length > 5 ? `, +${queries.length - 5} more` : '';
    console.error(`  ${chunk} (${size} B): ${shown}${extra}`);
  }
  console.error('Check artifactDirectory in packages/web/next.config.mjs.');
  process.exit(1);
}

const totalSize = liveChunks.reduce((sum, name) => sum + statSync(join(chunksDir, name)).size, 0);
const fileList = Object.keys(liveOperationsByFile).join(', ');
console.info(
  `verify-graphql-treeshake: OK — ${liveChunks.length} chunk(s) covering ` +
    `${liveOperationNames.length} live operation(s) from [${fileList}] ` +
    `(${totalSize} B total), ${mustBeAbsent.length} unrelated operation(s) checked, none leaked.`,
);
