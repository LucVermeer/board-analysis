import test from 'node:test';
import assert from 'node:assert/strict';
import { isLocalDatabaseUrl } from './db-connection.js';

// Real automation paths this must recognize as local, verified against the
// repo (see db-connection.ts's doc comment for the file:line evidence):
//   - Dockerfile.dev-db / setup-development-db.sh: postgresql://postgres@localhost/main
//   - docker-compose service name: postgresql://postgres:password@postgres:5432/main
//   - scripts/dev-db-discover.ts's Tailscale fallback: a MagicDNS *.ts.net name
//     or a 100.64.0.0/10 CGNAT address, used when local Docker isn't reachable.
void test('recognizes every real local/dev-tooling host shape as local', () => {
  assert.equal(isLocalDatabaseUrl('postgresql://postgres@localhost:5432/main'), true);
  assert.equal(isLocalDatabaseUrl('postgresql://postgres@127.0.0.1:5432/main'), true);
  assert.equal(isLocalDatabaseUrl('postgresql://postgres@[::1]:5432/main'), true);
  assert.equal(isLocalDatabaseUrl('postgresql://postgres:password@postgres:5432/main'), true);
  assert.equal(isLocalDatabaseUrl('postgresql://user:pass@foo.localtest.me:5432/db'), true);
  assert.equal(isLocalDatabaseUrl('postgresql://user:pass@localtest.me:5432/db'), true);
  assert.equal(isLocalDatabaseUrl('postgresql://user:pass@my-box.tailnet-name.ts.net:5432/db'), true);
  assert.equal(isLocalDatabaseUrl('postgresql://user:pass@100.64.0.1:5432/db'), true);
  assert.equal(isLocalDatabaseUrl('postgresql://user:pass@100.127.255.255:5432/db'), true);
});

void test('is case-insensitive on hostname', () => {
  assert.equal(isLocalDatabaseUrl('postgresql://postgres@LOCALHOST:5432/main'), true);
  assert.equal(isLocalDatabaseUrl('postgresql://user:pass@MY-BOX.TAILNET.TS.NET:5432/db'), true);
});

void test('refuses a real prod-shaped host (Railway proxy)', () => {
  assert.equal(
    isLocalDatabaseUrl('postgres://boardsesh_readonly:pw@tramway.proxy.rlwy.net:45638/railway?sslmode=require'),
    false,
  );
});

void test('refuses other plausible remote hosts', () => {
  assert.equal(isLocalDatabaseUrl('postgresql://user:pass@my-neon-project.neon.tech:5432/db'), false);
  assert.equal(isLocalDatabaseUrl('postgresql://user:pass@10.0.0.5:5432/db'), false);
  assert.equal(isLocalDatabaseUrl('postgresql://user:pass@192.168.1.20:5432/db'), false);
  assert.equal(isLocalDatabaseUrl('postgresql://user:pass@ts.net.attacker.example:5432/db'), false);
});

void test('rejects addresses just outside the Tailscale CGNAT range', () => {
  assert.equal(isLocalDatabaseUrl('postgresql://user:pass@100.63.255.255:5432/db'), false);
  assert.equal(isLocalDatabaseUrl('postgresql://user:pass@100.128.0.0:5432/db'), false);
});

void test('rejects octets that only look numeric to a loose parser (scientific notation, signs)', () => {
  // `Number('1e2')` is 100 — without a strict digit check, this would parse
  // as 100.100.0.1 and wrongly match the CGNAT range.
  assert.equal(isLocalDatabaseUrl('postgresql://user:pass@100.1e2.0.1:5432/db'), false);
  assert.equal(isLocalDatabaseUrl('postgresql://user:pass@+100.64.0.1:5432/db'), false);
});

void test('fails closed on malformed or empty URLs', () => {
  assert.equal(isLocalDatabaseUrl('not a url at all'), false);
  assert.equal(isLocalDatabaseUrl(''), false);
  assert.equal(isLocalDatabaseUrl('postgresql://'), false);
});
