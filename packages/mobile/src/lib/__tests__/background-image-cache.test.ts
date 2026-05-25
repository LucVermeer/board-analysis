import { describe, it, expect, vi, beforeEach } from 'vitest';

const downloadMock = vi.fn();
const fileInstances: MockFile[] = [];

class MockFile {
  uri: string;
  exists = false;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    fileInstances.push(this);
  }
  static downloadFileAsync = downloadMock;
}

class MockDirectory {
  uri: string;
  exists = true;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
  }
  create = vi.fn();
}

vi.mock('expo-file-system', () => ({
  File: MockFile,
  Directory: MockDirectory,
  Paths: {
    document: '/mock/documents',
  },
}));

vi.mock('../board-details', () => ({
  getBoardRenderData: vi.fn(),
}));

const { getThumbnailImageUrl, extractFilename, toFilesystemPath, ensureBackgroundsCached } =
  await import('../background-image-cache');
const { getBoardRenderData } = await import('../board-details');

describe('getThumbnailImageUrl', () => {
  it('inserts /thumbs/ and swaps .png to .webp', () => {
    const input = 'https://www.boardsesh.com/images/kilter/product_sizes_layouts_sets/36-1.png';
    expect(getThumbnailImageUrl(input)).toBe(
      'https://www.boardsesh.com/images/kilter/product_sizes_layouts_sets/thumbs/36-1.webp',
    );
  });

  it('preserves .webp extension unchanged', () => {
    const input = 'https://www.boardsesh.com/images/tension/product_sizes_layouts_sets/12.webp';
    expect(getThumbnailImageUrl(input)).toBe(
      'https://www.boardsesh.com/images/tension/product_sizes_layouts_sets/thumbs/12.webp',
    );
  });

  it('returns the input unchanged when there is no slash', () => {
    expect(getThumbnailImageUrl('noSlash.png')).toBe('noSlash.png');
  });

  it('handles moonboard background paths', () => {
    const input = 'https://www.boardsesh.com/images/moonboard/moonboard-bg.png';
    expect(getThumbnailImageUrl(input)).toBe(
      'https://www.boardsesh.com/images/moonboard/thumbs/moonboard-bg.webp',
    );
  });
});

describe('extractFilename', () => {
  it('extracts the last path segment', () => {
    expect(extractFilename('https://example.com/images/board/36-1.webp')).toBe('36-1.webp');
  });

  it('returns empty string for empty URL', () => {
    expect(extractFilename('')).toBe('');
  });

  it('handles URL with no slashes', () => {
    expect(extractFilename('file.webp')).toBe('file.webp');
  });
});

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
    downloadMock.mockReset();
    fileInstances.length = 0;
    vi.mocked(getBoardRenderData).mockReset();
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
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent downloads of the same URL', async () => {
    vi.mocked(getBoardRenderData).mockReturnValue({
      boardWidth: 100,
      boardHeight: 100,
      holdsData: [],
      imageUrls: ['https://example.com/images/kilter/bg.png'],
    } as ReturnType<typeof getBoardRenderData>);

    let resolveDownload: ((value: { uri: string }) => void) | undefined;
    downloadMock.mockImplementation(
      () =>
        new Promise<{ uri: string }>((resolve) => {
          resolveDownload = resolve;
        }),
    );

    const params = {
      boardName: 'kilter' as const,
      layoutId: 1,
      sizeId: 10,
      setIds: [24],
    };

    // Two callers race for the same background. Only one network download
    // should be issued; the second must reuse the in-flight promise.
    const firstCall = ensureBackgroundsCached(params);
    const secondCall = ensureBackgroundsCached(params);

    // Let the microtasks run so both ensureBackgroundsCached invocations
    // reach the inflight-tracking branch.
    await Promise.resolve();

    expect(downloadMock).toHaveBeenCalledTimes(1);

    resolveDownload?.({ uri: 'file:///mock/bg.webp' });
    const [firstPaths, secondPaths] = await Promise.all([firstCall, secondCall]);

    expect(firstPaths).toEqual(['/mock/bg.webp']);
    expect(secondPaths).toEqual(['/mock/bg.webp']);
    expect(downloadMock).toHaveBeenCalledTimes(1);
  });

  it('skips a layer when the download throws', async () => {
    vi.mocked(getBoardRenderData).mockReturnValue({
      boardWidth: 100,
      boardHeight: 100,
      holdsData: [],
      imageUrls: ['https://example.com/images/kilter/missing.png'],
    } as ReturnType<typeof getBoardRenderData>);

    downloadMock.mockRejectedValueOnce(new Error('404'));

    const result = await ensureBackgroundsCached({
      boardName: 'kilter',
      layoutId: 1,
      sizeId: 10,
      setIds: [24],
    });

    expect(result).toEqual([]);
  });
});
