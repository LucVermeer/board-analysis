import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { getBoardConfigForPlaylist } from '../../lib/playlists/board-details-for-playlist';
import { tryGetBackgroundPathsSync, ensureBackgroundsCached } from '../../lib/background-image-cache';

type PlaylistBoardBackdropProps = {
  boardType: string;
  layoutId: number | null | undefined;
};

/**
 * Blurred, dimmed board-image layer behind a playlist preview's colour tint —
 * the mobile take on web's frosted `BoardImageLayers` backdrop. Uses the same
 * bundled (no-network) background assets the play drawer loads, so it adds no
 * new assets or network calls. Renders nothing when the board can't resolve or
 * isn't bundled, letting the caller fall back to the plain colour tile (a
 * deliberate divergence from the play view's visible-broken policy: this is
 * decorative, so a clean colour fallback beats placeholder gaps).
 */
function PlaylistBoardBackdropImpl({ boardType, layoutId }: PlaylistBoardBackdropProps) {
  const config = useMemo(() => getBoardConfigForPlaylist(boardType, layoutId), [boardType, layoutId]);

  // Sync fast-path so production builds paint the backdrop on the first frame.
  const [path, setPath] = useState<string | null>(() => {
    if (!config) return null;
    return tryGetBackgroundPathsSync(config)?.paths[0] ?? null;
  });

  // Re-resolve when the board changes, and cover the dev path where assets are
  // served over Metro and must be materialized to disk first.
  useEffect(() => {
    if (!config) {
      setPath(null);
      return;
    }
    const sync = tryGetBackgroundPathsSync(config);
    if (sync?.paths[0]) {
      setPath(sync.paths[0]);
      return;
    }
    let cancelled = false;
    void ensureBackgroundsCached(config).then((result) => {
      if (!cancelled) setPath(result?.paths[0] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [config]);

  if (!config || !path) return null;

  return (
    <Image
      source={{ uri: path }}
      style={[StyleSheet.absoluteFill, styles.image]}
      contentFit="cover"
      blurRadius={12}
      cachePolicy="memory-disk"
      transition={0}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    // Wash out the board so the colour tint + emoji stay legible (expo-image
    // has no grayscale filter; low opacity approximates web's desaturation).
    opacity: 0.35,
  },
});

export const PlaylistBoardBackdrop = memo(PlaylistBoardBackdropImpl);
