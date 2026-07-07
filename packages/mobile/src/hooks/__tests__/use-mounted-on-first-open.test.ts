// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useMountedOnFirstOpen } from '../use-mounted-on-first-open';

describe('useMountedOnFirstOpen', () => {
  it('stays false until the first time visible is true', () => {
    const { result, rerender } = renderHook(({ visible }) => useMountedOnFirstOpen(visible), {
      initialProps: { visible: false },
    });
    expect(result.current).toBe(false);

    rerender({ visible: true });
    expect(result.current).toBe(true);
  });

  it('starts true when visible is true on the first render', () => {
    const { result } = renderHook(({ visible }) => useMountedOnFirstOpen(visible), {
      initialProps: { visible: true },
    });
    expect(result.current).toBe(true);
  });

  it('stays true after visible goes back to false', () => {
    const { result, rerender } = renderHook(({ visible }) => useMountedOnFirstOpen(visible), {
      initialProps: { visible: false },
    });

    rerender({ visible: true });
    expect(result.current).toBe(true);

    rerender({ visible: false });
    // Latched: the host stays mounted so its dismiss animation and re-opens work.
    expect(result.current).toBe(true);
  });
});
