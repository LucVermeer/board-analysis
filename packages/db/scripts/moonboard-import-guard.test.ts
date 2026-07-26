import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveMoonBoardImportDecision,
  assertMoonBoardImportAllowed,
  MOONBOARD_IMPORT_ALLOW_REMOTE_ENV_VAR,
} from './moonboard-import-guard.js';

const LOCAL_URL = 'postgresql://postgres@localhost:5432/main';
const REMOTE_URL = 'postgres://boardsesh_readonly:pw@tramway.proxy.rlwy.net:45638/railway?sslmode=require';

/** Save/restore MOONBOARD_IMPORT_ALLOW_REMOTE around a test that sets it. */
function withAllowRemoteEnv<T>(value: string | undefined, run: () => T): T {
  const original = process.env[MOONBOARD_IMPORT_ALLOW_REMOTE_ENV_VAR];
  if (value === undefined) {
    delete process.env[MOONBOARD_IMPORT_ALLOW_REMOTE_ENV_VAR];
  } else {
    process.env[MOONBOARD_IMPORT_ALLOW_REMOTE_ENV_VAR] = value;
  }
  try {
    return run();
  } finally {
    if (original === undefined) {
      delete process.env[MOONBOARD_IMPORT_ALLOW_REMOTE_ENV_VAR];
    } else {
      process.env[MOONBOARD_IMPORT_ALLOW_REMOTE_ENV_VAR] = original;
    }
  }
}

void test('a local database is always allowed, regardless of the override', () => {
  assert.equal(resolveMoonBoardImportDecision(LOCAL_URL, undefined), 'local');
  assert.equal(resolveMoonBoardImportDecision(LOCAL_URL, '1'), 'local');
  assert.equal(resolveMoonBoardImportDecision(LOCAL_URL, 'true'), 'local');
});

// The override is a distinct env var from DB_URL, so pointing DB_URL at the
// wrong host never implicitly sets it — a mistyped DB_URL alone (override
// undefined) is exactly this "refused by default" case.
void test('a remote database is refused by default', () => {
  assert.equal(resolveMoonBoardImportDecision(REMOTE_URL, undefined), 'remote-refused');
});

void test('a remote database is allowed only by the exact override value "1"', () => {
  assert.equal(resolveMoonBoardImportDecision(REMOTE_URL, '1'), 'remote-allowed');
});

void test('a remote database stays refused for any near-miss override value (fails closed)', () => {
  assert.equal(resolveMoonBoardImportDecision(REMOTE_URL, 'true'), 'remote-refused');
  assert.equal(resolveMoonBoardImportDecision(REMOTE_URL, 'yes'), 'remote-refused');
  assert.equal(resolveMoonBoardImportDecision(REMOTE_URL, ''), 'remote-refused');
  assert.equal(resolveMoonBoardImportDecision(REMOTE_URL, '01'), 'remote-refused');
});

// assertMoonBoardImportAllowed is the side-effecting wrapper around
// resolveMoonBoardImportDecision — it's what the two importer scripts
// actually call, so its process.exit/console branches need direct coverage
// too, not just the pure decision function. process.exit is mocked to a
// no-op (never actually terminates the test process); console.error/warn are
// mocked to assert on their calls instead of printing during the test run.
void test('assertMoonBoardImportAllowed returns silently for a local database', (t) => {
  const exitMock = t.mock.method(process, 'exit', (() => undefined) as unknown as typeof process.exit);
  const errorMock = t.mock.method(console, 'error', () => undefined);
  const warnMock = t.mock.method(console, 'warn', () => undefined);

  assertMoonBoardImportAllowed(LOCAL_URL, 'test-script');

  assert.equal(exitMock.mock.calls.length, 0);
  assert.equal(errorMock.mock.calls.length, 0);
  assert.equal(warnMock.mock.calls.length, 0);
});

void test('assertMoonBoardImportAllowed warns but proceeds when the override is set', (t) => {
  const exitMock = t.mock.method(process, 'exit', (() => undefined) as unknown as typeof process.exit);
  const errorMock = t.mock.method(console, 'error', () => undefined);
  const warnMock = t.mock.method(console, 'warn', () => undefined);

  withAllowRemoteEnv('1', () => {
    assertMoonBoardImportAllowed(REMOTE_URL, 'test-script');
  });

  assert.equal(exitMock.mock.calls.length, 0);
  assert.equal(errorMock.mock.calls.length, 0);
  assert.equal(warnMock.mock.calls.length, 1);
  const [warningMessage] = warnMock.mock.calls[0].arguments;
  assert.match(String(warningMessage), /MOONBOARD_IMPORT_ALLOW_REMOTE=1/);
  assert.match(String(warningMessage), /test-script/);
});

void test('assertMoonBoardImportAllowed errors and exits(1) when refused', (t) => {
  const exitMock = t.mock.method(process, 'exit', (() => undefined) as unknown as typeof process.exit);
  const errorMock = t.mock.method(console, 'error', () => undefined);
  const warnMock = t.mock.method(console, 'warn', () => undefined);

  withAllowRemoteEnv(undefined, () => {
    assertMoonBoardImportAllowed(REMOTE_URL, 'test-script');
  });

  assert.equal(warnMock.mock.calls.length, 0);
  assert.equal(exitMock.mock.calls.length, 1);
  assert.deepEqual(exitMock.mock.calls[0].arguments, [1]);
  assert.ok(errorMock.mock.calls.length > 0);
  const combinedErrorOutput = errorMock.mock.calls.map((call) => String(call.arguments[0])).join('\n');
  assert.match(combinedErrorOutput, /refuses to run against a non-local database/);
  assert.match(combinedErrorOutput, /test-script/);
  assert.match(combinedErrorOutput, /MOONBOARD_IMPORT_ALLOW_REMOTE=1/);
});
