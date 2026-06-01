import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  probeMetro,
  fetchMetroInfo,
  discoverBundlers,
  normalizeMetroHost,
  normalizeMetroTarget,
} from '../metro-discovery';

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
        if (input.endsWith('/_boardsesh/metro-info')) {
          return Promise.resolve({
            ok: false,
            json: async () => ({}),
          } as Response);
        }
        return Promise.resolve({
          ok: isLive,
          text: async () => (isLive ? 'packager-status:running' : 'nope'),
        } as Response);
      });

      const result = await discoverBundlers({ hosts: ['host-a', 'host-b'], ports: [8081, 8082] });

      expect(result).toEqual([
        {
          host: 'host-a',
          port: 8081,
          source: 'embedded',
          url: 'http://host-a:8081',
          metadata: null,
          metadataStatus: 'unavailable',
        },
        {
          host: 'host-b',
          port: 8082,
          source: 'embedded',
          url: 'http://host-b:8082',
          metadata: null,
          metadataStatus: 'unavailable',
        },
      ]);
    });

    it('returns an empty array when nothing responds', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('unreachable'));

      const result = await discoverBundlers({ hosts: ['host-a'], ports: [8081, 8082] });

      expect(result).toEqual([]);
    });

    it('probes every host x port combination in parallel', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        text: async () => '',
      } as Response);
      globalThis.fetch = fetchMock;

      await discoverBundlers({ hosts: ['host-a', 'host-b', 'host-c'], ports: [8081, 8082] });

      expect(fetchMock).toHaveBeenCalledTimes(6);
    });

    it('adds saved exact URLs and host scans without duplicating candidates', async () => {
      const fetchMock = vi.fn().mockImplementation((input: string) => {
        if (input.endsWith('/_boardsesh/metro-info')) {
          return Promise.resolve({
            ok: false,
            json: async () => ({}),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          text: async () => 'packager-status:running',
        } as Response);
      });
      globalThis.fetch = fetchMock;

      const result = await discoverBundlers({
        hosts: ['host-a'],
        savedTargets: ['host-a', 'http://host-b:8082'],
        ports: [8081, 8082],
      });

      expect(result.map((bundler) => bundler.url)).toEqual([
        'http://host-a:8081',
        'http://host-a:8082',
        'http://host-b:8082',
      ]);
    });

    it('attaches Metro metadata when the dev endpoint responds', async () => {
      globalThis.fetch = vi.fn().mockImplementation((input: string) => {
        if (input === 'http://host-a:8081/_boardsesh/metro-info') {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              version: 1,
              branchName: 'feature/mobile',
              commitSha: 'abc1234',
              rootDir: '/repo/worktree',
              label: 'worktree',
              port: 8081,
              startedAt: '2026-05-29T00:00:00.000Z',
              qaNotes: 'Open the queue and swipe.',
              qaNotesFilePath: '/repo/.boardsesh/qa-notes.md',
            }),
          } as Response);
        }

        return Promise.resolve({
          ok: true,
          text: async () => 'packager-status:running',
        } as Response);
      });

      const result = await discoverBundlers({ hosts: ['host-a'], ports: [8081] });

      expect(result[0]?.metadataStatus).toBe('loaded');
      expect(result[0]?.metadata?.branchName).toBe('feature/mobile');
      expect(result[0]?.metadata?.qaNotes).toBe('Open the queue and swipe.');
    });
  });

  describe('fetchMetroInfo', () => {
    it('returns null when the metadata shape is invalid', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ branchName: 'missing-version' }),
      } as Response);

      await expect(fetchMetroInfo('host-a', 8081)).resolves.toBeNull();
    });
  });

  describe('normalizers', () => {
    it('normalizes hosts and http URL targets', () => {
      expect(normalizeMetroHost('HOST-A.example.')).toBe('host-a.example');
      expect(normalizeMetroTarget('HOST-A.example')).toBe('host-a.example');
      expect(normalizeMetroTarget('host-a.example:8084')).toBe('http://host-a.example:8084');
      expect(normalizeMetroTarget('http://host-a.example:8084/foo')).toBe('http://host-a.example:8084');
    });

    it('rejects unsupported targets', () => {
      expect(normalizeMetroHost('http://host-a:8081')).toBeNull();
      expect(normalizeMetroTarget('https://host-a:8081')).toBeNull();
      expect(normalizeMetroTarget('host-a')).toBe('host-a');
      expect(normalizeMetroTarget('host-a:not-a-port')).toBeNull();
    });
  });
});
