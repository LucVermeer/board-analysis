import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';
import type { Climb } from '@/app/lib/types';
import { PlaylistActivationProvider, useOptionalPlaylistActivation } from '../playlist-activation-context';

function createTestClimb(overrides?: Partial<Climb>): Climb {
  return {
    uuid: 'climb-1',
    setter_username: 'setter1',
    name: 'Test Climb',
    description: 'A test climb',
    frames: 'p1r12p2r13',
    angle: 40,
    ascensionist_count: 5,
    difficulty: '7',
    quality_average: '3.5',
    stars: 3,
    difficulty_error: '',
    mirrored: false,
    benchmark_difficulty: null,
    userAscents: 0,
    userAttempts: 0,
    ...overrides,
  } as Climb;
}

describe('playlist-activation-context', () => {
  it('returns null when no provider is mounted', () => {
    const { result } = renderHook(() => useOptionalPlaylistActivation());

    expect(result.current).toBeNull();
  });

  it('returns the provider value and activates through the supplied callback', async () => {
    const activatePlaylistClimb = vi.fn(async () => {});
    const climb = createTestClimb({ uuid: 'playlist-climb' });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PlaylistActivationProvider value={{ activatePlaylistClimb }}>{children}</PlaylistActivationProvider>
    );

    const { result } = renderHook(() => useOptionalPlaylistActivation(), { wrapper });

    expect(result.current).not.toBeNull();
    await act(async () => {
      await result.current!.activatePlaylistClimb(climb);
    });

    expect(activatePlaylistClimb).toHaveBeenCalledWith(climb);
  });
});
