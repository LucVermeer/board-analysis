import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getServerAuthToken } from '@/app/lib/auth/server-auth';
import { serverMyBoards, serverSmartPlaylist } from '@/app/lib/graphql/server-cached-client';
import { getServerTranslation } from '@/app/lib/i18n/server';
import { createNoIndexMetadata } from '@/app/lib/seo/metadata';
import I18nProvider from '@/app/components/providers/i18n-provider';
import { smartPlaylistBySlug } from '@/app/lib/smart-playlists';
import SmartPlaylistContent from './smart-playlist-content';
import styles from '@/app/components/library/playlist-view.module.css';

type RouteParams = { smart_playlist: string; user_id: string };

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { smart_playlist, user_id } = await params;
  const preset = smartPlaylistBySlug(smart_playlist);
  const { t, locale } = await getServerTranslation('playlists');

  if (!preset) {
    return createNoIndexMetadata({
      title: t('library.smart.notFound.title'),
      description: t('library.smart.notFound.description'),
      path: `/discover/${smart_playlist}/${user_id}`,
      locale,
    });
  }

  return createNoIndexMetadata({
    title: t(preset.titleI18nKey),
    description: t(preset.descriptionI18nKey),
    path: `/discover/${preset.slug}/${user_id}`,
    locale,
  });
}

export default async function SmartPlaylistPage({ params }: { params: Promise<RouteParams> }) {
  const { smart_playlist, user_id } = await params;
  const preset = smartPlaylistBySlug(smart_playlist);
  if (!preset) {
    notFound();
  }

  const authToken = await getServerAuthToken();
  const { locale } = await getServerTranslation('playlists');
  const [initialMyBoards, initialSmartPlaylist] = await Promise.all([
    authToken ? serverMyBoards(authToken) : null,
    // First render on the client uses `selectedBoard = null` (selectedBoard is
    // only set when the user picks a board chip), so omit boardName here to
    // line up with the client's first `useInfiniteQuery` key (`'all'`).
    serverSmartPlaylist(authToken, { type: preset.type, userId: user_id, page: 0, pageSize: 20 }),
  ]);

  return (
    <I18nProvider locale={locale} namespaces={['playlists', 'climbs', 'feed']}>
      <div className={styles.pageContainer}>
        <SmartPlaylistContent
          smartPlaylistType={preset.type}
          smartPlaylistSlug={preset.slug}
          userId={user_id}
          initialMyBoards={initialMyBoards}
          initialSmartPlaylist={initialSmartPlaylist}
        />
      </div>
    </I18nProvider>
  );
}
