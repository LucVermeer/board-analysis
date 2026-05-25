import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../board-details', () => ({
  getBoardRenderData: vi.fn(),
}));

const downloadAsyncMock = vi.fn().mockResolvedValue(undefined);
class MockAsset {
  localUri: string | null;
  constructor(public moduleId: number) {
    // Simulate production: bundled assets have localUri pre-populated.
    this.localUri = `file:///bundled/${moduleId}.webp`;
  }
  downloadAsync = downloadAsyncMock;
  static fromModule(moduleId: number) {
    return new MockAsset(moduleId);
  }
}

vi.mock('expo-asset', () => ({
  Asset: MockAsset,
}));

vi.mock('../board-backgrounds-manifest', () => ({
  BOARD_BACKGROUND_ASSETS: {
    'kilter/product_sizes_layouts_sets/36-1.webp': 100,
    'tension/product_sizes_layouts_sets/12.webp': 200,
  },
}));

const { toFilesystemPath, ensureBackgroundsCached, tryGetBackgroundPathsSync } = await import(
  '../background-image-cache'
);
const { getBoardRenderData } = await import('../board-details');

describe('toFilesystemPath', () => {
  it('strips file:// prefix', () => {
    expect(toFilesystemPath('file:///data/cache/img.png')).toBe('/data/cache/img.png');
  });

  it('returns plain paths unchanged', () => {
    expect(toFilesystemPath('/data/cache/img.png')).toBe('/data/cache/img.png');
  });

  it('only strips the first file:// occurrence', () => {
    expect(toFilesystemPath('file:///path/file://weird')).toBe('/path/file://weird');
  });
});

describe('ensureBackgroundsCached', () => {
  beforeEach(() => {
    vi.mocked(getBoardRenderData).mockReset();
    downloadAsyncMock.mockClear();
  });

  it('returns empty array when board render data is missing', async () => {
    vi.mocked(getBoardRenderData).mockReturnValue(null);
    const result = await ensureBackgroundsCached({
      boardName: 'kilter',
      layoutId: 1,
      sizeId: 10,
      setIds: [24],
    });
    expect(result).toEqual([]);
  });

  it('resolves bundled assets without calling downloadAsync when localUri is populated', async () => {
    vi.mocked(getBoardRenderData).mockReturnValue({
      boardWidth: 100,
      boardHeight: 100,
      holdsData: [],
      imageUrls: ['https://www.boardsesh.com/images/kilter/product_sizes_layouts_sets/36-1.png'],
    } as ReturnType<typeof getBoardRenderData>);

    const result = await ensureBackgroundsCached({
      boardName: 'kilter',
      layoutId: 1,
      sizeId: 10,
      setIds: [24],
    });

    expect(result).toEqual(['/bundled/100.webp']);
    // Production bundled assets short-circuit downloadAsync via the sync
    // fast-path — neither ensureBackgroundsCached nor the underlying
    // sync resolver should call it.
    expect(downloadAsyncMock).not.toHaveBeenCalled();
  });

  it('rewrites .png URL suffix to .webp before looking up the manifest', async () => {
    vi.mocked(getBoardRenderData).mockReturnValue({
      boardWidth: 100,
      boardHeight: 100,
      holdsData: [],
      // Server URLs always come back with .png; manifest only has .webp.
      imageUrls: ['https://www.boardsesh.com/images/tension/product_sizes_layouts_sets/12.png'],
    } as ReturnType<typeof getBoardRenderData>);

    const result = await ensureBackgroundsCached({
      boardName: 'tension',
      layoutId: 1,
      sizeId: 10,
      setIds: [24],
    });

    expect(result).toEqual(['/bundled/200.webp']);
  });

  it('skips layers missing from the manifest (no network fallback)', async () => {
    vi.mocked(getBoardRenderData).mockReturnValue({
      boardWidth: 100,
      boardHeight: 100,
      holdsData: [],
      imageUrls: ['https://www.boardsesh.com/images/newboard/bg.png'],
    } as ReturnType<typeof getBoardRenderData>);

    const result = await ensureBackgroundsCached({
      boardName: 'kilter',
      layoutId: 1,
      sizeId: 10,
      setIds: [24],
    });

    // The no-network rule means a manifest miss is silent (after a one-time
    // warn) — the caller gets back an empty path list and the renderer
    // shows nothing for that layer.
    expect(result).toEqual([]);
    expect(downloadAsyncMock).not.toHaveBeenCalled();
  });
});

describe('tryGetBackgroundPathsSync', () => {
  beforeEach(() => {
    vi.mocked(getBoardRenderData).mockReset();
  });

  it('returns paths synchronously when bundled assets resolve', () => {
    vi.mocked(getBoardRenderData).mockReturnValue({
      boardWidth: 100,
      boardHeight: 100,
      holdsData: [],
      imageUrls: ['https://www.boardsesh.com/images/kilter/product_sizes_layouts_sets/36-1.png'],
    } as ReturnType<typeof getBoardRenderData>);

    const result = tryGetBackgroundPathsSync({
      boardName: 'kilter',
      layoutId: 1,
      sizeId: 10,
      setIds: [24],
    });

    expect(result).toEqual(['/bundled/100.webp']);
  });

  it('returns null on any manifest miss', () => {
    vi.mocked(getBoardRenderData).mockReturnValue({
      boardWidth: 100,
      boardHeight: 100,
      holdsData: [],
      imageUrls: [
        'https://www.boardsesh.com/images/kilter/product_sizes_layouts_sets/36-1.png',
        'https://www.boardsesh.com/images/newboard/bg.png',
      ],
    } as ReturnType<typeof getBoardRenderData>);

    const result = tryGetBackgroundPathsSync({
      boardName: 'kilter',
      layoutId: 1,
      sizeId: 10,
      setIds: [24],
    });

    expect(result).toBeNull();
  });

  it('returns null when getBoardRenderData fails', () => {
    vi.mocked(getBoardRenderData).mockReturnValue(null);
    const result = tryGetBackgroundPathsSync({
      boardName: 'kilter',
      layoutId: 1,
      sizeId: 10,
      setIds: [24],
    });
    expect(result).toBeNull();
  });
});
