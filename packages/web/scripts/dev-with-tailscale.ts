import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const rootDirectory = resolve(scriptDirectory, '../../..');

type HostResolution = {
  hostname: string;
  source: 'env' | 'tailscale' | 'fallback';
  reason?: string;
};

const DEFAULT_WEB_PORT = '3000';
const DEFAULT_BACKEND_PORT = '8080';
const TAILSCALE_STATUS_TIMEOUT_MS = 1500;

function normalizeHostname(value: string): string | null {
  const trimmed = value.trim().replace(/\.$/, '');
  if (!trimmed) return null;

  if (trimmed.includes('://') || trimmed.includes('/') || trimmed.includes(':')) {
    return null;
  }

  if (!/^[a-zA-Z0-9.-]+$/.test(trimmed)) {
    return null;
  }

  return trimmed.toLowerCase();
}

function resolveHostname(): HostResolution {
  const envHostnameRaw = process.env.TAILSCALE_HOSTNAME;
  if (envHostnameRaw !== undefined) {
    const envHostname = normalizeHostname(envHostnameRaw);
    if (envHostname) {
      return { hostname: envHostname, source: 'env' };
    }

    return {
      hostname: 'localhost',
      source: 'fallback',
      reason: 'TAILSCALE_HOSTNAME is invalid; falling back to localhost',
    };
  }

  try {
    const statusJson = execFileSync('tailscale', ['status', '--json'], {
      encoding: 'utf8',
      timeout: TAILSCALE_STATUS_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const parsed = JSON.parse(statusJson) as { Self?: { DNSName?: string } };
    const dnsName = parsed.Self?.DNSName;

    if (!dnsName) {
      return {
        hostname: 'localhost',
        source: 'fallback',
        reason: 'tailscale status missing Self.DNSName; falling back to localhost',
      };
    }

    const normalizedDnsName = normalizeHostname(dnsName);
    if (!normalizedDnsName) {
      return {
        hostname: 'localhost',
        source: 'fallback',
        reason: 'tailscale DNSName invalid; falling back to localhost',
      };
    }

    return { hostname: normalizedDnsName, source: 'tailscale' };
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException).code;
    if (errorCode === 'ENOENT') {
      return {
        hostname: 'localhost',
        source: 'fallback',
        reason: 'tailscale CLI not installed; falling back to localhost',
      };
    }

    return {
      hostname: 'localhost',
      source: 'fallback',
      reason: 'tailscale unavailable; falling back to localhost',
    };
  }
}

function setDefaultEnv(key: string, value: string): void {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

// Force-override even if .env.local set the value. The committed .env.local pins
// localhost:3000 as a generic dev default, which is wrong for Tailscale + auto-
// incremented ports — next-auth's client tries to fetch a session URL that
// doesn't match the page origin and Safari throws "string did not match the
// expected pattern" on URL parsing.
function overrideEnv(key: string, value: string): void {
  process.env[key] = value;
}

function applyGeneratedDevDbEnv(): void {
  const envFile = join(rootDirectory, '.boardsesh', 'dev-db.env');
  if (!existsSync(envFile)) return;

  const inheritedKeys = new Set(Object.keys(process.env));
  const lines = readFileSync(envFile, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;

    const separatorIndex = trimmedLine.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = trimmedLine.slice(0, separatorIndex);
    if (!/^[A-Z0-9_]+$/.test(key)) continue;
    if (inheritedKeys.has(key)) continue;

    process.env[key] = trimmedLine.slice(separatorIndex + 1);
  }
}

function main(): void {
  applyGeneratedDevDbEnv();

  const webPort = process.env.PORT || DEFAULT_WEB_PORT;
  const backendPort = process.env.BACKEND_PORT || DEFAULT_BACKEND_PORT;
  const resolution = resolveHostname();

  // HTTPS mode: orchestrator has provisioned a Tailscale cert and injected
  // DEV_HTTPS_CERT_FILE / DEV_HTTPS_KEY_FILE. Both must be present to switch
  // schemes; otherwise stay on HTTP so non-Tailscale devs are unaffected.
  const certFile = process.env.DEV_HTTPS_CERT_FILE;
  const keyFile = process.env.DEV_HTTPS_KEY_FILE;
  const tlsEnabled = !!(certFile && keyFile);
  const httpScheme = tlsEnabled ? 'https' : 'http';
  const wsScheme = tlsEnabled ? 'wss' : 'ws';

  const webOrigin = `${httpScheme}://${resolution.hostname}:${webPort}`;
  setDefaultEnv('NEXT_PUBLIC_WS_URL', `${wsScheme}://${resolution.hostname}:${backendPort}/graphql`);
  // Override (not setDefault) — the .env.local localhost:3000 default mismatches
  // the actual page origin in Tailscale / auto-incremented-port mode.
  overrideEnv('NEXTAUTH_URL', webOrigin);
  overrideEnv('BASE_URL', webOrigin);

  console.info(`[dev] Hostname: ${resolution.hostname} (${resolution.source})`);
  if (resolution.reason) {
    console.info(`[dev] ${resolution.reason}`);
  }
  console.info(`[dev] Web URL: ${httpScheme}://${resolution.hostname}:${webPort}`);
  console.info(`[dev] Backend WS URL: ${process.env.NEXT_PUBLIC_WS_URL}`);
  if (tlsEnabled) {
    console.info('[dev] TLS: serving via Next.js --experimental-https with Tailscale cert');
  }

  // In TLS mode the cert is issued for the Tailscale MagicDNS hostname, not
  // localhost. Binding Next to that hostname keeps its printed URL aligned
  // with the certificate and avoids users opening https://localhost:<port>,
  // which will always fail certificate validation.
  const bindHostname = tlsEnabled ? resolution.hostname : '0.0.0.0';
  const nextArgs = ['dev', '--hostname', bindHostname, '--turbopack'];
  if (tlsEnabled) {
    // Next.js requires --experimental-https to switch the dev server into
    // HTTPS mode; the cert+key flags then point at the files to use instead
    // of auto-generating a self-signed one. Without --experimental-https the
    // other two flags are silently ignored and the banner still says http://.
    nextArgs.push('--experimental-https', '--experimental-https-cert', certFile!, '--experimental-https-key', keyFile!);
  }

  const nextProcess = spawn('next', nextArgs, {
    env: process.env,
    stdio: 'inherit',
  });

  nextProcess.on('error', (error) => {
    console.error('[dev] Failed to start Next.js dev server:', error);
    process.exit(1);
  });

  nextProcess.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main();
