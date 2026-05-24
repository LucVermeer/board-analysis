import { describe, it, expect, vi } from 'vitest';

vi.mock('expo-file-system', () => ({
  File: class MockFile {
    uri = '';
    exists = false;
    static downloadFileAsync = vi.fn();
  },
  Directory: class MockDirectory {
    uri = '';
    exists = false;
    create = vi.fn();
  },
  Paths: { document: '/mock' },
}));

vi.mock('../../lib/board-details', () => ({
  getBoardRenderData: () => null,
}));

vi.mock('../../lib/background-image-cache', () => ({
  ensureBackgroundsCached: vi.fn().mockResolvedValue([]),
}));

const { buildCacheKey } = await import('../use-native-thumbnail');

describe('buildCacheKey', () => {
  it('includes all parameters in the key', () => {
    const key = buildCacheKey('kilter', 1, 10, '24,25', 'p1r42p2r43', false);
    expect(key).toContain('kilter');
    expect(key).toContain('1');
    expect(key).toContain('10');
    expect(key).toContain('24,25');
    expect(key).toContain('p1r42p2r43');
  });

  it('produces different keys for different frames', () => {
    const keyA = buildCacheKey('kilter', 1, 10, '24', 'p1r42', false);
    const keyB = buildCacheKey('kilter', 1, 10, '24', 'p2r43', false);
    expect(keyA).not.toBe(keyB);
  });

  it('produces different keys for mirrored vs non-mirrored', () => {
    const normal = buildCacheKey('kilter', 1, 10, '24', 'p1r42', false);
    const mirrored = buildCacheKey('kilter', 1, 10, '24', 'p1r42', true);
    expect(normal).not.toBe(mirrored);
  });

  it('produces different keys for different boards', () => {
    const kilter = buildCacheKey('kilter', 1, 10, '24', 'p1r42', false);
    const tension = buildCacheKey('tension', 1, 10, '24', 'p1r42', false);
    expect(kilter).not.toBe(tension);
  });

  it('is deterministic', () => {
    const keyA = buildCacheKey('kilter', 1, 10, '24,25', 'p1r42p2r43', false);
    const keyB = buildCacheKey('kilter', 1, 10, '24,25', 'p1r42p2r43', false);
    expect(keyA).toBe(keyB);
  });

  it('includes a version prefix', () => {
    const key = buildCacheKey('kilter', 1, 10, '24', 'p1r42', false);
    expect(key).toMatch(/^v\d+_/);
  });

  it('does not collide on similar parameter values', () => {
    const keyA = buildCacheKey('kilter', 1, 10, '24', 'p1r42', false);
    const keyB = buildCacheKey('kilter', 11, 0, '24', 'p1r42', false);
    expect(keyA).not.toBe(keyB);
  });
});
