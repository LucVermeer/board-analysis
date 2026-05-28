import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { probeMetro, discoverBundlers } from '../metro-discovery';

describe('metro-discovery', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('probeMetro', () => {
    it('returns true when Metro responds 200 with the packager-status body', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => 'packager-status:running',
      } as Response);

      await expect(probeMetro('host.example', 8081)).resolves.toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://host.example:8081/status',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('returns false on non-200 responses', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        text: async () => 'packager-status:running',
      } as Response);

      await expect(probeMetro('host.example', 8081)).resolves.toBe(false);
    });

    it('returns false when the body does not match the Metro signature', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => 'something else',
      } as Response);

      await expect(probeMetro('host.example', 8081)).resolves.toBe(false);
    });

    it('returns false when fetch rejects (timeout, network error, etc.)', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('aborted'));

      await expect(probeMetro('host.example', 8081)).resolves.toBe(false);
    });
  });

  describe('discoverBundlers', () => {
    it('returns only live host:port pairs', async () => {
      globalThis.fetch = vi.fn().mockImplementation((input: string) => {
        const isLive = input === 'http://host-a:8081/status' || input === 'http://host-b:8082/status';
        return Promise.resolve({
          ok: isLive,
          text: async () => (isLive ? 'packager-status:running' : 'nope'),
        } as Response);
      });

      const result = await discoverBundlers(['host-a', 'host-b'], [8081, 8082]);

      expect(result).toEqual([
        { host: 'host-a', port: 8081, url: 'http://host-a:8081' },
        { host: 'host-b', port: 8082, url: 'http://host-b:8082' },
      ]);
    });

    it('returns an empty array when nothing responds', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('unreachable'));

      const result = await discoverBundlers(['host-a'], [8081, 8082]);

      expect(result).toEqual([]);
    });

    it('probes every host x port combination in parallel', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        text: async () => '',
      } as Response);
      globalThis.fetch = fetchMock;

      await discoverBundlers(['host-a', 'host-b', 'host-c'], [8081, 8082]);

      expect(fetchMock).toHaveBeenCalledTimes(6);
    });
  });
});
