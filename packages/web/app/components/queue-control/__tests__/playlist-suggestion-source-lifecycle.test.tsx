// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vite-plus/test';
import { useClearPlaylistSuggestionSourceOnUnmount } from '../use-clear-playlist-suggestion-source-on-unmount';

describe('playlist suggestion source lifecycle', () => {
  it('clears the playlist suggestion source when leaving a playlist route', () => {
    const setPlaylistSuggestionSource = vi.fn();

    const { unmount } = renderHook(() =>
      useClearPlaylistSuggestionSourceOnUnmount({
        setPlaylistSuggestionSource,
      }),
    );

    expect(setPlaylistSuggestionSource).not.toHaveBeenCalled();

    unmount();

    expect(setPlaylistSuggestionSource).toHaveBeenCalledWith(null);
  });

  it('uses the latest queue actions on unmount', () => {
    const staleSetPlaylistSuggestionSource = vi.fn();
    const latestSetPlaylistSuggestionSource = vi.fn();

    const { rerender, unmount } = renderHook(
      ({ setPlaylistSuggestionSource }) => useClearPlaylistSuggestionSourceOnUnmount({ setPlaylistSuggestionSource }),
      {
        initialProps: {
          setPlaylistSuggestionSource: staleSetPlaylistSuggestionSource,
        },
      },
    );

    rerender({ setPlaylistSuggestionSource: latestSetPlaylistSuggestionSource });
    unmount();

    expect(staleSetPlaylistSuggestionSource).not.toHaveBeenCalled();
    expect(latestSetPlaylistSuggestionSource).toHaveBeenCalledWith(null);
  });
});
