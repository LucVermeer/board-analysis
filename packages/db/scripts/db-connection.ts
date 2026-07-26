import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment files (same as migrate.ts)
config({ path: path.resolve(__dirname, '../../../.boardsesh/dev-db.env') });
config({ path: path.resolve(__dirname, '../../../.env.local') });
config({ path: path.resolve(__dirname, '../../web/.env.local') });
config({ path: path.resolve(__dirname, '../../web/.env.development.local') });

export function getScriptDatabaseUrl(): string {
  const databaseUrl = process.env.DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL, POSTGRES_URL, or DB_URL is not set');
    process.exit(1);
  }

  const isLocalUrl =
    databaseUrl.includes('localhost') || databaseUrl.includes('localtest.me') || databaseUrl.includes('127.0.0.1');

  if (process.env.VERCEL && isLocalUrl) {
    console.error('Refusing to run with local DATABASE_URL in Vercel build');
    process.exit(1);
  }

  return databaseUrl;
}

const LOOPBACK_OR_COMPOSE_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', 'postgres']);

// NOTE ON "LOCAL": a Tailscale address/hostname is NOT local in the everyday
// sense — it's routed over the internet to a real machine. It counts as
// "local" HERE only because of what this file's callers use it for: telling
// apart a developer's own dev database from a real (prod/staging) one.
// scripts/dev-db-discover.ts's fallback path (used whenever local Docker isn't
// reachable — the normal case in a sandboxed/cloud dev environment, and the
// reason this matters at all) resolves DATABASE_URL to a Tailscale peer's
// MagicDNS name or CGNAT address when it can't find a Docker Postgres. That
// peer is still just the developer's own machine or a shared dev box, never
// Boardsesh's production or staging infrastructure (those are reached by
// public Railway/Neon hostnames, never Tailscale). So recognizing these two
// host shapes is what makes the guard compatible with that workflow instead of
// forcing every Tailscale-based dev setup through the manual remote-override
// env var on every run. Do NOT remove this without confirming
// scripts/dev-db-discover.ts no longer produces these host shapes.
//
// Tailscale's CGNAT range (RFC 6598, carved out for Tailscale's own use):
// 100.64.0.0/10, i.e. first octet 100 and second octet 64-127 inclusive.
function isTailscaleCgnatAddress(hostname: string): boolean {
  const octets = hostname.split('.');
  if (octets.length !== 4) return false;
  const parsed = octets.map(Number);
  if (parsed.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  const [first, second] = parsed;
  return first === 100 && second >= 64 && second <= 127;
}

// Tailscale's MagicDNS domain. Match the whole final label, not a substring,
// so e.g. "evil-ts.net.attacker.example" can't slip through.
function isTailscaleMagicDnsHostname(hostname: string): boolean {
  return hostname === 'ts.net' || hostname.endsWith('.ts.net');
}

function isLocaltestMeHostname(hostname: string): boolean {
  return hostname === 'localtest.me' || hostname.endsWith('.localtest.me');
}

/**
 * True when `databaseUrl` resolves to a host that is unambiguously local or
 * dev-tooling infrastructure, never a real (prod/staging) database:
 *
 *  - Loopback / the `postgres` docker-compose service name (Dockerfile.dev-db
 *    and setup-development-db.sh always target one of these).
 *  - `*.localtest.me` (resolves to 127.0.0.1; used elsewhere in this repo for
 *    subdomain-aware local dev).
 *  - A Tailscale-reached dev box: MagicDNS (`*.ts.net`) or CGNAT
 *    (`100.64.0.0/10`) — see the NOTE ON "LOCAL" comment above for why these
 *    two, despite not being local in the everyday sense, belong in this list.
 *
 * Fails CLOSED: an unparseable URL is treated as non-local.
 */
export function isLocalDatabaseUrl(databaseUrl: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(databaseUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  // Strip IPv6 brackets (URL#hostname keeps them, e.g. "[::1]").
  const normalizedHost = hostname.replace(/^\[|\]$/g, '');
  if (!normalizedHost) return false;

  return (
    LOOPBACK_OR_COMPOSE_HOSTNAMES.has(normalizedHost) ||
    isLocaltestMeHostname(normalizedHost) ||
    isTailscaleMagicDnsHostname(normalizedHost) ||
    isTailscaleCgnatAddress(normalizedHost)
  );
}

type ScriptDb = ReturnType<typeof drizzle>;

export function createScriptDb(url?: string): { db: ScriptDb; close: () => Promise<void> } {
  const databaseUrl = url ?? getScriptDatabaseUrl();
  // Scripts are short-lived one-shots and target the direct (non-pooled) URL,
  // so a single connection is sufficient and avoids opening 10 by default.
  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client);
  return {
    db,
    close: async () => {
      await client.end();
    },
  };
}
