import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMoonBoardImportDecision } from './moonboard-import-guard.js';

const LOCAL_URL = 'postgresql://postgres@localhost:5432/main';
const REMOTE_URL = 'postgres://boardsesh_readonly:pw@tramway.proxy.rlwy.net:45638/railway?sslmode=require';

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
