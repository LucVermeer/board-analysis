import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('thumbnail-url', () => {
  const originalEnv = process.env.EXPO_PUBLIC_WEB_URL;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.EXPO_PUBLIC_WEB_URL;
    } else {
      process.env.EXPO_PUBLIC_WEB_URL = originalEnv;
    }
    vi.resetModules();
  });

  async function loadModule() {
    return import('../thumbnail-url');
  }

  it('builds a thumbnail URL with all parameters', async () => {
    process.env.EXPO_PUBLIC_WEB_URL = 'https://example.com';
    vi.resetModules();
    const { buildThumbnailUrl } = await loadModule();

    const url = buildThumbnailUrl({
      boardName: 'kilter' as const,
      layoutId: 1,
      sizeId: 10,
      setIds: '24,25',
      frames: 'p1r12p2r13',
    });

    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://example.com');
    expect(parsed.pathname).toBe('/api/internal/board-render');
    expect(parsed.searchParams.get('board_name')).toBe('kilter');
    expect(parsed.searchParams.get('layout_id')).toBe('1');
    expect(parsed.searchParams.get('size_id')).toBe('10');
    expect(parsed.searchParams.get('set_ids')).toBe('24,25');
    expect(parsed.searchParams.get('frames')).toBe('p1r12p2r13');
    expect(parsed.searchParams.get('thumbnail')).toBe('1');
    expect(parsed.searchParams.get('include_background')).toBe('1');
  });

  it('builds a full render URL without the thumbnail flag', async () => {
    process.env.EXPO_PUBLIC_WEB_URL = 'https://example.com';
    vi.resetModules();
    const { buildFullRenderUrl } = await loadModule();

    const url = buildFullRenderUrl({
      boardName: 'tension' as const,
      layoutId: 2,
      sizeId: 5,
      setIds: '10',
      frames: 'p100r14',
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.get('board_name')).toBe('tension');
    expect(parsed.searchParams.get('thumbnail')).toBeNull();
    expect(parsed.searchParams.get('include_background')).toBe('1');
  });

  it('URL-encodes frames with special characters', async () => {
    process.env.EXPO_PUBLIC_WEB_URL = 'https://example.com';
    vi.resetModules();
    const { buildThumbnailUrl } = await loadModule();

    const url = buildThumbnailUrl({
      boardName: 'kilter' as const,
      layoutId: 1,
      sizeId: 10,
      setIds: '24',
      frames: 'p1r12,p2r13',
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.get('frames')).toBe('p1r12,p2r13');
    expect(url).toContain('frames=p1r12');
  });

  it('falls back to boardsesh.com when env var is not set', async () => {
    delete process.env.EXPO_PUBLIC_WEB_URL;
    vi.resetModules();
    const { buildThumbnailUrl } = await loadModule();

    const url = buildThumbnailUrl({
      boardName: 'kilter' as const,
      layoutId: 1,
      sizeId: 10,
      setIds: '24',
      frames: 'p1r12',
    });

    expect(url).toContain('https://www.boardsesh.com/api/internal/board-render');
  });

  it('produces deterministic URLs for cache hits', async () => {
    process.env.EXPO_PUBLIC_WEB_URL = 'https://example.com';
    vi.resetModules();
    const { buildThumbnailUrl } = await loadModule();

    const params = {
      boardName: 'kilter' as const,
      layoutId: 1,
      sizeId: 10,
      setIds: '24,25',
      frames: 'p1r12p2r13',
    };

    expect(buildThumbnailUrl(params)).toBe(buildThumbnailUrl(params));
  });
});
