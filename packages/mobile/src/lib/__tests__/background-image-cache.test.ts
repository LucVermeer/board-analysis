import { describe, it, expect, vi } from 'vitest';

vi.mock('expo-file-system', () => ({
  File: class MockFile {
    uri: string;
    exists = false;
    constructor(...parts: string[]) {
      this.uri = parts.join('/');
    }
    static downloadFileAsync = vi.fn();
  },
  Directory: class MockDirectory {
    uri: string;
    exists = false;
    constructor(...parts: string[]) {
      this.uri = parts.join('/');
    }
    create = vi.fn();
  },
  Paths: {
    document: '/mock/documents',
  },
}));

const { getThumbnailImageUrl, extractFilename, toFilesystemPath } = await import(
  '../background-image-cache'
);

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
