import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dns.lookup before importing the module under test so the lookup call
// is intercepted. The real resolver returns external IPs for IG/TikTok hosts
// in CI, but we want tests to run offline and to deterministically exercise
// the private-IP rejection path.
const { mockDnsLookup } = vi.hoisted(() => ({
  mockDnsLookup: vi.fn<typeof import('node:dns/promises').lookup>(),
}));

vi.mock('node:dns/promises', () => ({
  lookup: mockDnsLookup,
}));

import { assertAllowedImageHost, isPrivateIp, UnsafeImageHostError } from '../lib/safe-image-fetch';

const lookupResolves = (addr: string, family = 4) => {
  // dns.lookup overload returning all addresses when called with `{ all: true }`.
  // The default overload signature returns a single address; we cast via
  // unknown to mock the all-addresses overload our module uses.
  mockDnsLookup.mockResolvedValue([{ address: addr, family }] as unknown as Awaited<
    ReturnType<typeof import('node:dns/promises').lookup>
  >);
};

describe('isPrivateIp', () => {
  it('detects RFC1918 IPv4 ranges', () => {
    expect(isPrivateIp('10.0.0.1')).toBe(true);
    expect(isPrivateIp('172.16.5.5')).toBe(true);
    expect(isPrivateIp('172.31.255.254')).toBe(true);
    expect(isPrivateIp('192.168.1.1')).toBe(true);
  });

  it('detects loopback and link-local IPv4', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true); // AWS IMDS
    expect(isPrivateIp('169.254.1.1')).toBe(true);
  });

  it('detects CGNAT, multicast, and 0.0.0.0/8', () => {
    expect(isPrivateIp('100.64.0.1')).toBe(true);
    expect(isPrivateIp('100.127.255.254')).toBe(true);
    expect(isPrivateIp('224.0.0.1')).toBe(true);
    expect(isPrivateIp('239.255.255.255')).toBe(true);
    expect(isPrivateIp('0.0.0.0')).toBe(true);
  });

  it('passes public IPv4 through', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('157.240.0.0')).toBe(false); // Facebook
    expect(isPrivateIp('172.32.0.1')).toBe(false); // outside 172.16-31
    expect(isPrivateIp('172.15.255.255')).toBe(false);
  });

  it('detects loopback, link-local, and ULA IPv6', () => {
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('::')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
    expect(isPrivateIp('fc00::1')).toBe(true);
    expect(isPrivateIp('fdff::beef')).toBe(true);
  });

  it('passes public IPv6 through', () => {
    expect(isPrivateIp('2001:db8::1')).toBe(false);
    expect(isPrivateIp('2620:2d:4000:1::1')).toBe(false);
  });

  it('rejects IPv4-mapped IPv6 addresses with private embedded IPv4', () => {
    expect(isPrivateIp('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateIp('::ffff:8.8.8.8')).toBe(false);
  });
});

describe('assertAllowedImageHost', () => {
  beforeEach(() => {
    mockDnsLookup.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('accepts known FB CDN / IG hosts when DNS resolves to a public IP', async () => {
    lookupResolves('157.240.241.63');
    await expect(
      assertAllowedImageHost('https://scontent.cdninstagram.com/foo.jpg', 'instagram'),
    ).resolves.toBeUndefined();
    await expect(
      assertAllowedImageHost('https://scontent-iad3-1.fbcdn.net/x.jpg', 'instagram'),
    ).resolves.toBeUndefined();
  });

  it('accepts known TikTok CDN hosts', async () => {
    lookupResolves('150.101.34.180');
    await expect(
      assertAllowedImageHost('https://p16-common-sign.tiktokcdn.com/photo.jpg', 'tiktok'),
    ).resolves.toBeUndefined();
    await expect(
      assertAllowedImageHost('https://p16-sign.tiktokcdn-us.com/photo.jpg', 'tiktok'),
    ).resolves.toBeUndefined();
    // EU CDN — thumbnails served to European clients land on tiktokcdn-eu.com.
    // The dev proxy already treats this suffix as valid; the S3-cache path
    // must too, otherwise EU-region TikTok thumbnails silently fail to cache.
    await expect(
      assertAllowedImageHost('https://p16-sign.tiktokcdn-eu.com/photo.jpg', 'tiktok'),
    ).resolves.toBeUndefined();
  });

  it('rejects non-https URLs', async () => {
    await expect(
      assertAllowedImageHost('http://scontent.cdninstagram.com/foo.jpg', 'instagram'),
    ).rejects.toBeInstanceOf(UnsafeImageHostError);
  });

  it('rejects unparseable URLs', async () => {
    await expect(assertAllowedImageHost('not-a-url', 'instagram')).rejects.toBeInstanceOf(UnsafeImageHostError);
  });

  it('rejects hosts outside the platform allowlist', async () => {
    await expect(assertAllowedImageHost('https://example.com/foo.jpg', 'instagram')).rejects.toBeInstanceOf(
      UnsafeImageHostError,
    );
    await expect(assertAllowedImageHost('https://localhost/foo.jpg', 'instagram')).rejects.toBeInstanceOf(
      UnsafeImageHostError,
    );
  });

  it('rejects an IG host when called with kind: tiktok and vice versa', async () => {
    await expect(assertAllowedImageHost('https://scontent.cdninstagram.com/foo.jpg', 'tiktok')).rejects.toBeInstanceOf(
      UnsafeImageHostError,
    );
    await expect(assertAllowedImageHost('https://p16-sign.tiktokcdn.com/foo.jpg', 'instagram')).rejects.toBeInstanceOf(
      UnsafeImageHostError,
    );
  });

  it('rejects allowlisted hostnames that resolve to a private IP (DNS rebinding defense)', async () => {
    lookupResolves('169.254.169.254');
    await expect(
      assertAllowedImageHost('https://scontent.cdninstagram.com/foo.jpg', 'instagram'),
    ).rejects.toBeInstanceOf(UnsafeImageHostError);
  });

  it('rejects when DNS resolution itself fails', async () => {
    mockDnsLookup.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(
      assertAllowedImageHost('https://scontent.cdninstagram.com/foo.jpg', 'instagram'),
    ).rejects.toBeInstanceOf(UnsafeImageHostError);
  });
});
