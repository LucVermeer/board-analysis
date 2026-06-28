// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cfg = vi.hoisted(() => ({ local: false }));

vi.mock('../../providers/queue-provider', () => ({
  useHasActiveClimb: () => cfg.local,
}));

import { useHasAccessoryClimb } from '../use-has-accessory-climb';

describe('useHasAccessoryClimb', () => {
  beforeEach(() => {
    cfg.local = false;
  });

  it('is false when there is no local queue climb', () => {
    const { result } = renderHook(() => useHasAccessoryClimb());
    expect(result.current).toBe(false);
  });

  it('is true when a local queue climb is present', () => {
    cfg.local = true;
    const { result } = renderHook(() => useHasAccessoryClimb());
    expect(result.current).toBe(true);
  });
});
