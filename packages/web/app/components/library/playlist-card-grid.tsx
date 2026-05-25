'use client';

import React from 'react';
import Skeleton from '@mui/material/Skeleton';
import type { Playlist } from '@boardsesh/graphql/operations/playlists';
import PlaylistCard from './playlist-card';
import styles from './library.module.css';

type PlaylistCardGridProps = {
  playlists: Playlist[];
  getPlaylistUrl: (uuid: string) => string;
  loading?: boolean;
  /** Callback when a card's pin button is tapped. Enables the pin overlay. */
  onTogglePin?: (uuid: string, nextPinned: boolean) => void;
  /** Set of currently-pinned playlist UUIDs. Drives the pin button icon state. */
  pinnedUuids?: Set<string>;
};

export default function PlaylistCardGrid({
  playlists,
  getPlaylistUrl,
  loading,
  onTogglePin,
  pinnedUuids,
}: PlaylistCardGridProps) {
  if (loading) {
    return (
      <div className={styles.cardGrid}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={styles.skeletonCompact}>
            <Skeleton variant="rounded" width={48} height={48} />
            <div className={styles.skeletonCompactText}>
              <Skeleton variant="text" width="80%" />
              <Skeleton variant="text" width="50%" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (playlists.length === 0) {
    return null;
  }

  return (
    <div className={styles.cardGrid}>
      {playlists.map((playlist, index) => (
        <PlaylistCard
          key={playlist.uuid}
          name={playlist.name}
          climbCount={playlist.climbCount}
          boardType={playlist.boardType}
          layoutId={playlist.layoutId}
          color={playlist.color}
          icon={playlist.icon}
          href={getPlaylistUrl(playlist.uuid)}
          variant="grid"
          index={index}
          fetchPriority={index === 0 ? 'high' : undefined}
          isPinned={pinnedUuids?.has(playlist.uuid)}
          onTogglePin={onTogglePin ? (nextPinned) => onTogglePin(playlist.uuid, nextPinned) : undefined}
        />
      ))}
    </div>
  );
}
