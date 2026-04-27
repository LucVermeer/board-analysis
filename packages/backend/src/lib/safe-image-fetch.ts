import { lookup } from 'node:dns/promises';

// Hostname allowlists for the platforms whose thumbnails we cache. Each entry
// matches the *exact* hostname (case-insensitive) — wildcard support is
// expressed as a regex. Anything outside these patterns is rejected before we
// even resolve DNS, which is the first line of defense against SSRF via
// attacker-controlled `og:image` URLs.
const HOST_ALLOWLISTS: Record<ImageHostKind, RegExp> = {
  // Facebook / Instagram CDN. og:image on canonical IG posts and the embed
  // path both currently come back from these hostnames.
  instagram: /^[a-z0-9-]+\.(fbcdn\.net|cdninstagram\.com)$/i,
  // TikTok oEmbed thumbnails. Hosts like p16-common-sign.tiktokcdn.com,
  // p16-sign.tiktokcdn.com, p16.tiktokcdn-us.com all show up in practice.
  tiktok: /^[a-z0-9-]+\.(tiktokcdn\.com|tiktokcdn-us\.com)$/i,
};

export type ImageHostKind = 'instagram' | 'tiktok';

export class UnsafeImageHostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeImageHostError';
  }
}

// Returns true for IPs that should never be reachable from a server-side
// fetch initiated on behalf of a user — loopback, RFC1918 private space,
// link-local (incl. AWS instance metadata at 169.254.169.254), CGNAT,
// multicast, IPv6 loopback / unique-local / link-local. Pass an IP literal
// returned from `dns.lookup`, not a hostname.
export function isPrivateIp(addr: string): boolean {
  // IPv4
  const v4 = addr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 (loopback)
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local + AWS IMDS)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
    if (a >= 224 && a <= 239) return true; // 224.0.0.0/4 (multicast)
    if (a === 0) return true; // 0.0.0.0/8
    return false;
  }
  // IPv6 — be conservative; reject loopback, unspecified, link-local (fe80::/10),
  // unique-local (fc00::/7), and IPv4-mapped private ranges.
  const lower = addr.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
    return true; // fe80::/10
  }
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) — re-check the embedded IPv4.
  const mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateIp(mapped[1]);
  return false;
}

// Validates that `url` is safe to fetch server-side and write back to a
// public S3 bucket. Throws UnsafeImageHostError on any failure. The check
// is two-layered:
//   1. Host pattern: reject anything outside the platform's CDN allowlist.
//      Cheap and catches the obvious cases without a DNS round-trip.
//   2. DNS resolution: reject if any A/AAAA record falls in a private /
//      reserved range. Defense in depth against DNS rebinding and against
//      a CDN hostname that's been pointed at an internal IP.
//
// Both layers must pass. The DNS check uses dns.lookup (Node's libuv-backed
// resolver) so /etc/hosts is honored — important in dev / CI.
export async function assertAllowedImageHost(rawUrl: string, kind: ImageHostKind): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UnsafeImageHostError(`Invalid image URL: ${rawUrl}`);
  }

  if (parsed.protocol !== 'https:') {
    throw new UnsafeImageHostError(`Refusing non-https image URL: ${rawUrl}`);
  }

  if (!HOST_ALLOWLISTS[kind].test(parsed.hostname)) {
    throw new UnsafeImageHostError(`Host ${parsed.hostname} is not in the ${kind} allowlist`);
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(parsed.hostname, { all: true });
  } catch {
    throw new UnsafeImageHostError(`Could not resolve ${parsed.hostname}`);
  }

  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw new UnsafeImageHostError(`Refusing image fetch: ${parsed.hostname} resolves to private IP ${address}`);
    }
  }
}
