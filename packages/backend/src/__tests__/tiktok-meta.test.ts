import { describe, it, expect, beforeEach, afterEach, vi } from 'vite-plus/test';
import {
  clearTikTokMetaCache,
  fetchTikTokMeta,
  getTikTokCacheId,
  isTikTokUrl,
  TIKTOK_META_TTL_MS,
  TIKTOK_TRANSIENT_TTL_MS,
} from '../lib/tiktok-meta';
import { logger } from '../utils/logger';

const LONG_URL = 'https://www.tiktok.com/@scout2015/video/6718335390845095173';
const SHORT_URL = 'https://vm.tiktok.com/ZSL4xXWxR/';

function oembedBody(opts: { thumbnail?: string | null; author?: string | null } = {}) {
  return JSON.stringify({
    thumbnail_url:
      opts.thumbnail === undefined
        ? 'https://p16-common-sign.tiktokcdn.com/tos/0123/photo.jpg?x-expires=1'
        : opts.thumbnail,
    author_unique_id: opts.author === undefined ? 'scout2015' : opts.author,
  });
}

function mockFetchOnce(body: string, status = 200): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(JSON.parse(body)),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('isTikTokUrl', () => {
  it('accepts long-form, short-link, mobile, and multi-subdomain hosts', () => {
    expect(isTikTokUrl(LONG_URL)).toBe(true);
    expect(isTikTokUrl(SHORT_URL)).toBe(true);
    expect(isTikTokUrl('https://m.tiktok.com/@a/video/1')).toBe(true);
    expect(isTikTokUrl('https://www.us.tiktok.com/@a/video/1')).toBe(true);
  });

  it('rejects lookalikes and non-tiktok hosts', () => {
    expect(isTikTokUrl('https://tiktok.com.evil.com/foo')).toBe(false);
    expect(isTikTokUrl('https://nottiktok.com/foo')).toBe(false);
    expect(isTikTokUrl('https://www.instagram.com/reel/abc/')).toBe(false);
  });
});

describe('getTikTokCacheId', () => {
  it('returns numeric video id for long-form URLs', () => {
    expect(getTikTokCacheId(LONG_URL)).toBe('6718335390845095173');
  });

  it('returns a stable hashed key for short links', () => {
    const a = getTikTokCacheId(SHORT_URL);
    const b = getTikTokCacheId(SHORT_URL);
    expect(a).toBe(b);
    expect(a).toMatch(/^s[a-f0-9]+$/);
  });

  it('returns null for non-tiktok URLs', () => {
    expect(getTikTokCacheId('https://www.instagram.com/reel/abc/')).toBeNull();
  });
});

describe('fetchTikTokMeta', () => {
  beforeEach(() => {
    clearTikTokMetaCache();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('happy path: returns thumbnail + author_unique_id', async () => {
    mockFetchOnce(oembedBody());
    const result = await fetchTikTokMeta(LONG_URL);
    expect(result).toEqual({
      status: 'ok',
      thumbnail: 'https://p16-common-sign.tiktokcdn.com/tos/0123/photo.jpg?x-expires=1',
      username: 'scout2015',
    });
  });

  it('falls back to author_name when author_unique_id is missing', async () => {
    mockFetchOnce(JSON.stringify({ thumbnail_url: 'https://p16.tiktokcdn.com/x.jpg', author_name: 'Some Climber' }));
    const result = await fetchTikTokMeta(LONG_URL);
    expect(result).toMatchObject({ status: 'ok', username: 'Some Climber' });
  });

  it('maps 404 to gone', async () => {
    mockFetchOnce('{}', 404);
    const result = await fetchTikTokMeta(LONG_URL);
    expect(result).toEqual({ status: 'gone' });
  });

  it('maps 410 to gone', async () => {
    mockFetchOnce('{}', 410);
    const result = await fetchTikTokMeta(LONG_URL);
    expect(result).toEqual({ status: 'gone' });
  });

  it('maps other non-OK responses to transient_error', async () => {
    mockFetchOnce('', 503);
    const result = await fetchTikTokMeta(LONG_URL);
    expect(result).toEqual({ status: 'transient_error' });
  });

  it('maps 200-without-thumbnail_url to transient_error', async () => {
    mockFetchOnce(oembedBody({ thumbnail: null }));
    const result = await fetchTikTokMeta(LONG_URL);
    expect(result).toEqual({ status: 'transient_error' });
  });

  it('returns transient_error when fetch throws', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchTikTokMeta(LONG_URL);
    expect(result).toEqual({ status: 'transient_error' });
  });

  it('returns transient_error when JSON is malformed', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('bad json')),
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchTikTokMeta(LONG_URL);
    expect(result).toEqual({ status: 'transient_error' });
  });

  it('returns gone for non-tiktok URLs without fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchTikTokMeta('https://www.instagram.com/reel/abc/');
    expect(result).toEqual({ status: 'gone' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('caches successful results within TTL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(JSON.parse(oembedBody())),
    });
    vi.stubGlobal('fetch', fetchMock);

    const a = await fetchTikTokMeta(LONG_URL);
    const b = await fetchTikTokMeta(LONG_URL);

    expect(a).toEqual(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent calls for the same URL', async () => {
    let resolveJson!: (v: object) => void;
    const jsonPromise = new Promise<object>((resolve) => {
      resolveJson = resolve;
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => jsonPromise,
    });
    vi.stubGlobal('fetch', fetchMock);

    const p1 = fetchTikTokMeta(LONG_URL);
    const p2 = fetchTikTokMeta(LONG_URL);
    resolveJson(JSON.parse(oembedBody()));

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(r2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('negative-caches transient_error briefly so a rate-limit does not cause refetches on every read', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(oembedBody())) });
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchTikTokMeta(LONG_URL);
    const second = await fetchTikTokMeta(LONG_URL);

    expect(first).toEqual({ status: 'transient_error' });
    expect(second).toEqual({ status: 'transient_error' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refetches after the negative TTL expires', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(oembedBody())) });
    vi.stubGlobal('fetch', fetchMock);

    const start = Date.now();
    const dateSpy = vi.spyOn(Date, 'now');
    dateSpy.mockReturnValue(start);

    const first = await fetchTikTokMeta(LONG_URL);
    expect(first).toEqual({ status: 'transient_error' });

    dateSpy.mockReturnValue(start + TIKTOK_TRANSIENT_TTL_MS + 1);

    const second = await fetchTikTokMeta(LONG_URL);
    expect(second.status).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refetches after the cache TTL expires', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(JSON.parse(oembedBody())),
    });
    vi.stubGlobal('fetch', fetchMock);

    const start = Date.now();
    const dateSpy = vi.spyOn(Date, 'now');
    dateSpy.mockReturnValue(start);

    await fetchTikTokMeta(LONG_URL);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    dateSpy.mockReturnValue(start + TIKTOK_META_TTL_MS + 1);
    await fetchTikTokMeta(LONG_URL);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('opens the circuit after a burst of transient errors and short-circuits subsequent calls', async () => {
    const transientResponse = { ok: false, status: 503, json: () => Promise.resolve({}) };
    const fetchMock = vi.fn().mockResolvedValue(transientResponse);
    vi.stubGlobal('fetch', fetchMock);

    const dateSpy = vi.spyOn(Date, 'now');
    dateSpy.mockReturnValue(0);

    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);

    for (let i = 0; i < 10; i++) {
      const url = `https://www.tiktok.com/@user/video/${String(i).padStart(19, '0')}`;
      const result = await fetchTikTokMeta(url);
      expect(result).toEqual({ status: 'transient_error' });
    }
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // Eleventh URL: breaker is open, no fetch call is made.
    const blocked = await fetchTikTokMeta('https://www.tiktok.com/@user/video/9999999999999999999');
    expect(blocked).toEqual({ status: 'transient_error' });
    expect(fetchMock).toHaveBeenCalledTimes(10);

    // Jump past the 5-minute cooldown and confirm the breaker closes.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(JSON.parse(oembedBody())),
    });
    dateSpy.mockReturnValue(5 * 60 * 1000 + 1);
    const recovered = await fetchTikTokMeta(LONG_URL);
    expect(recovered.status).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(11);
  });
});
