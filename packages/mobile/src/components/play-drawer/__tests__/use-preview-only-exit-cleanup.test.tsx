// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePreviewOnlyExitCleanup } from '../use-preview-only-exit-cleanup';

describe('usePreviewOnlyExitCleanup', () => {
  it('does not fire on mount when starting in preview-only', () => {
    const onExit = vi.fn();
    renderHook(({ isPreviewOnly }) => usePreviewOnlyExitCleanup(isPreviewOnly, onExit), {
      initialProps: { isPreviewOnly: true },
    });
    expect(onExit).not.toHaveBeenCalled();
  });

  it('does not fire on mount when starting outside preview-only', () => {
    const onExit = vi.fn();
    renderHook(({ isPreviewOnly }) => usePreviewOnlyExitCleanup(isPreviewOnly, onExit), {
      initialProps: { isPreviewOnly: false },
    });
    expect(onExit).not.toHaveBeenCalled();
  });

  it('fires once when preview-only flips true → false', () => {
    const onExit = vi.fn();
    const { rerender } = renderHook(({ isPreviewOnly }) => usePreviewOnlyExitCleanup(isPreviewOnly, onExit), {
      initialProps: { isPreviewOnly: true },
    });
    rerender({ isPreviewOnly: false });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('does not fire when entering preview-only (false → true)', () => {
    const onExit = vi.fn();
    const { rerender } = renderHook(({ isPreviewOnly }) => usePreviewOnlyExitCleanup(isPreviewOnly, onExit), {
      initialProps: { isPreviewOnly: false },
    });
    rerender({ isPreviewOnly: true });
    expect(onExit).not.toHaveBeenCalled();
  });

  it('does not fire when preview-only stays unchanged', () => {
    const onExit = vi.fn();
    const { rerender } = renderHook(({ isPreviewOnly }) => usePreviewOnlyExitCleanup(isPreviewOnly, onExit), {
      initialProps: { isPreviewOnly: true },
    });
    rerender({ isPreviewOnly: true });
    rerender({ isPreviewOnly: false });
    rerender({ isPreviewOnly: false });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('invokes the latest callback on the transition', () => {
    const firstCallback = vi.fn();
    const latestCallback = vi.fn();
    const { rerender } = renderHook(({ isPreviewOnly, onExit }) => usePreviewOnlyExitCleanup(isPreviewOnly, onExit), {
      initialProps: { isPreviewOnly: true, onExit: firstCallback },
    });
    rerender({ isPreviewOnly: false, onExit: latestCallback });
    expect(firstCallback).not.toHaveBeenCalled();
    expect(latestCallback).toHaveBeenCalledTimes(1);
  });
});
