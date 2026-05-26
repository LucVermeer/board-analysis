import { execFileSync } from 'node:child_process';

export type TailscaleHostResolution = {
  hostname: string;
  source: 'env' | 'tailscale' | 'fallback';
  reason?: string;
};

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

export function resolveTailscaleHostname(): TailscaleHostResolution {
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

  let statusJson: string;
  try {
    statusJson = execFileSync('tailscale', ['status', '--json'], {
      encoding: 'utf8',
      timeout: TAILSCALE_STATUS_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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

  let parsed: unknown;
  try {
    parsed = JSON.parse(statusJson);
  } catch {
    return {
      hostname: 'localhost',
      source: 'fallback',
      reason: 'tailscale status returned malformed JSON; falling back to localhost',
    };
  }

  const dnsName = extractSelfDnsName(parsed);
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
}

function extractSelfDnsName(parsed: unknown): string | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  const self = (parsed as { Self?: unknown }).Self;
  if (typeof self !== 'object' || self === null) return null;
  const dnsName = (self as { DNSName?: unknown }).DNSName;
  return typeof dnsName === 'string' ? dnsName : null;
}
