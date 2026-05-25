import { describe, it, expect, vi, beforeEach } from 'vitest';

// The shim calls requireOptionalNativeModule from expo-modules-core to look
// up the native binary. We control what it returns per test by reassigning
// the variable the mock factory closes over before each import.
type NativeMock = {
  renderHoldsOverlay?: ((configJson: string, cacheKey: string) => Promise<string>) | unknown;
  renderComposite?: (
    configJson: string,
    backgroundPaths: string[],
    cacheKey: string,
  ) => Promise<string>;
} | null;

let nativeMock: NativeMock = null;

vi.mock('expo-modules-core', () => ({
  requireOptionalNativeModule: () => nativeMock,
}));

// Resetting modules between tests guarantees the shim re-evaluates its
// top-level `requireOptionalNativeModule(...)` call against the freshly
// assigned `nativeMock`. Without this, the first import would freeze a
// single nativeMock reference for every subsequent test.
async function loadShim() {
  vi.resetModules();
  return await import('../../../modules/board-renderer/src/index');
}

beforeEach(() => {
  nativeMock = null;
});

describe('renderHoldsOverlay shim', () => {
  it('uses the new path when renderHoldsOverlay is a real working function', async () => {
    const renderHolds = vi.fn().mockResolvedValue('file:///out/new.png');
    const renderComposite = vi.fn().mockResolvedValue('file:///out/old.png');
    nativeMock = { renderHoldsOverlay: renderHolds, renderComposite };

    const { renderHoldsOverlay } = await loadShim();
    const result = await renderHoldsOverlay('{"json":true}', 'cache-key-1');

    expect(result).toBe('file:///out/new.png');
    expect(renderHolds).toHaveBeenCalledWith('{"json":true}', 'cache-key-1');
    expect(renderComposite).not.toHaveBeenCalled();
  });

  it('falls through to renderComposite when renderHoldsOverlay rejects with "is not a function"', async () => {
    // Simulates the NativeModulesProxy-lies-about-method-presence case:
    // typeof says it is a function, but invocation rejects.
    const renderHolds = vi
      .fn()
      .mockRejectedValue(
        new TypeError('renderHoldsOverlay is not a function on this binary'),
      );
    const renderComposite = vi.fn().mockResolvedValue('file:///out/old.png');
    nativeMock = { renderHoldsOverlay: renderHolds, renderComposite };

    const { renderHoldsOverlay } = await loadShim();
    const result = await renderHoldsOverlay('{"json":true}', 'cache-key-2');

    expect(result).toBe('file:///out/old.png');
    expect(renderHolds).toHaveBeenCalledTimes(1);
    // The whole point of the fix: empty backgroundPaths + same configJson + same cacheKey.
    expect(renderComposite).toHaveBeenCalledWith('{"json":true}', [], 'cache-key-2');
  });

  it('falls through when renderHoldsOverlay throws synchronously with a missing-method error', async () => {
    const renderHolds = vi.fn(() => {
      throw new Error('Unknown method: renderHoldsOverlay');
    });
    const renderComposite = vi.fn().mockResolvedValue('file:///out/old.png');
    nativeMock = { renderHoldsOverlay: renderHolds, renderComposite };

    const { renderHoldsOverlay } = await loadShim();
    const result = await renderHoldsOverlay('{"json":true}', 'cache-key-3');

    expect(result).toBe('file:///out/old.png');
    expect(renderComposite).toHaveBeenCalledWith('{"json":true}', [], 'cache-key-3');
  });

  it('propagates real render errors instead of swallowing them', async () => {
    // OOM/disk-full/bad-JSON errors must NOT be misread as "method missing"
    // — the hook's catch block needs to log them.
    const renderHolds = vi
      .fn()
      .mockRejectedValue(new Error('Out of memory while rasterizing overlay'));
    const renderComposite = vi.fn().mockResolvedValue('file:///out/old.png');
    nativeMock = { renderHoldsOverlay: renderHolds, renderComposite };

    const { renderHoldsOverlay } = await loadShim();
    await expect(renderHoldsOverlay('{"json":true}', 'cache-key-4')).rejects.toThrow(
      'Out of memory while rasterizing overlay',
    );
    expect(renderComposite).not.toHaveBeenCalled();
  });

  it('uses renderComposite directly when renderHoldsOverlay is not a function on the binary', async () => {
    const renderComposite = vi.fn().mockResolvedValue('file:///out/old.png');
    nativeMock = { renderComposite };

    const { renderHoldsOverlay } = await loadShim();
    const result = await renderHoldsOverlay('{"json":true}', 'cache-key-5');

    expect(result).toBe('file:///out/old.png');
    expect(renderComposite).toHaveBeenCalledWith('{"json":true}', [], 'cache-key-5');
  });

  it('throws when the native module is not linked at all', async () => {
    nativeMock = null;
    const { renderHoldsOverlay } = await loadShim();
    await expect(renderHoldsOverlay('{"json":true}', 'cache-key-6')).rejects.toThrow(
      /BoardRenderer native module is not available/,
    );
  });

  it('throws when neither function is exposed', async () => {
    nativeMock = {};
    const { renderHoldsOverlay } = await loadShim();
    await expect(renderHoldsOverlay('{"json":true}', 'cache-key-7')).rejects.toThrow(
      /no usable render function/,
    );
  });
});
