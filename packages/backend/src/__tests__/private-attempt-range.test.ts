import { describe, expect, it } from 'vite-plus/test';
import { parsePrivateAttemptByteRange } from '../handlers/private-attempt-videos';
import { privateAttemptAssetPath } from '../services/private-attempt-videos';

describe('private attempt byte ranges', () => {
  it('supports bounded, open-ended, and suffix ranges', () => {
    expect(parsePrivateAttemptByteRange(undefined, 10)).toBeNull();
    expect(parsePrivateAttemptByteRange('bytes=2-5', 10)).toEqual({ start: 2, end: 5 });
    expect(parsePrivateAttemptByteRange('bytes=7-', 10)).toEqual({ start: 7, end: 9 });
    expect(parsePrivateAttemptByteRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 });
    expect(parsePrivateAttemptByteRange('bytes=5-500', 10)).toEqual({ start: 5, end: 9 });
  });

  it('rejects malformed and unsatisfiable ranges', () => {
    for (const range of ['items=0-1', 'bytes=10-11', 'bytes=5-2', 'bytes=0-1,4-5', 'bytes=-0']) {
      expect(() => parsePrivateAttemptByteRange(range, 10)).toThrow(
        expect.objectContaining({ code: 'INVALID_RANGE', status: 416 }),
      );
    }
  });

  it('accepts only opaque server asset keys', () => {
    expect(privateAttemptAssetPath('d9428888-122b-11e1-b85c-61cd3cbb3210.webm')).toMatch(/\.webm$/);
    expect(() => privateAttemptAssetPath('../private.webm')).toThrow(
      expect.objectContaining({ code: 'INVALID_ASSET_KEY' }),
    );
    expect(() => privateAttemptAssetPath('/tmp/private.webm')).toThrow(
      expect.objectContaining({ code: 'INVALID_ASSET_KEY' }),
    );
  });
});
