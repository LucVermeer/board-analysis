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
