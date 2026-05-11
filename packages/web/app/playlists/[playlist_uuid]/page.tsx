import React from 'react';
import type { Metadata } from 'next';
import { getServerAuthToken } from '@/app/lib/auth/server-auth';
import { serverMyBoards, serverPlaylist, serverPlaylistClimbs } from '@/app/lib/graphql/server-cached-client';
import { generatePlaylistMetadata } from '@/app/lib/seo/playlist-metadata';
import { getLocale } from '@/app/lib/i18n/get-locale';
import I18nProvider from '@/app/components/providers/i18n-provider';
import PlaylistDetailContent from './playlist-detail-content';
import styles from '@/app/components/library/playlist-view.module.css';

export async function generateMetadata({ params }: { params: Promise<{ playlist_uuid: string }> }): Promise<Metadata> {
  const { playlist_uuid } = await params;
  return generatePlaylistMetadata(playlist_uuid);
}

export default async function PlaylistDetailPage({ params }: { params: Promise<{ playlist_uuid: string }> }) {
  const { playlist_uuid } = await params;

  const authToken = await getServerAuthToken();
  const locale = await getLocale();
  const [initialMyBoards, initialPlaylist] = await Promise.all([
    authToken ? serverMyBoards(authToken) : null,
    serverPlaylist(authToken, playlist_uuid),
  ]);

  const initialClimbs = initialPlaylist
    ? await serverPlaylistClimbs(authToken, { playlistId: playlist_uuid, page: 0, pageSize: 20 })
    : null;

  return (
    <I18nProvider
      locale={locale}
      namespaces={['common', 'climbs', 'session', 'boards', 'profile', 'feed', 'playlists']}
    >
      <div className={styles.pageContainer}>
        <PlaylistDetailContent
          playlistUuid={playlist_uuid}
          initialMyBoards={initialMyBoards}
          initialPlaylist={initialPlaylist}
          initialClimbs={initialClimbs}
        />
      </div>
    </I18nProvider>
  );
}
