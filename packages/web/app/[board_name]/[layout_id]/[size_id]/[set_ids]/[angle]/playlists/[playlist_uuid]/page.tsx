import React from 'react';
import { notFound } from 'next/navigation';
import type { BoardRouteParameters } from '@/app/lib/types';
import { parseBoardRouteParamsWithSlugs } from '@/app/lib/url-utils.server';
import type { Metadata } from 'next';
import { getServerAuthToken } from '@/app/lib/auth/server-auth';
import { serverMyBoards } from '@/app/lib/graphql/server-cached-client';
import { createNoIndexMetadata } from '@/app/lib/seo/metadata';
import { getServerTranslation } from '@/app/lib/i18n/server';
import { getLocale } from '@/app/lib/i18n/get-locale';
import I18nProvider from '@/app/components/providers/i18n-provider';
import PlaylistDetailContent from '@/app/playlists/[playlist_uuid]/playlist-detail-content';
import { getPlaylistLcpPreloadUrl } from '@/app/lib/lcp-preload-url';
import styles from '@/app/components/library/playlist-view.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const { t, locale } = await getServerTranslation('playlists');
  return createNoIndexMetadata({
    title: t('metadata.detail.fallbackTitle'),
    description: t('metadata.detail.fallbackDescription'),
    locale,
  });
}

type PlaylistDetailRouteParams = BoardRouteParameters & {
  playlist_uuid: string;
};

export default async function PlaylistDetailPage(props: { params: Promise<PlaylistDetailRouteParams> }) {
  const params = await props.params;

  try {
    // Validate route params (throws if invalid board/layout/size/set combination)
    const parsed = await parseBoardRouteParamsWithSlugs(params);
    const playlistsBasePath = `/${params.board_name}/${params.layout_id}/${params.size_id}/${params.set_ids}/${params.angle}/playlists`;

    // Fetch user's boards server-side for instant board filter selection
    const authToken = await getServerAuthToken();
    const locale = await getLocale();
    const initialMyBoards = authToken ? await serverMyBoards(authToken) : null;

    // Preload the LCP board thumbnail. The route params alone are enough to
    // derive the URL — no playlist fetch required — so the browser can start
    // the request before the client chunk hydrates.
    const lcpPreloadUrl = getPlaylistLcpPreloadUrl({
      boardType: parsed.board_name,
      layoutId: parsed.layout_id,
    });

    return (
      <I18nProvider locale={locale} namespaces={['playlists']}>
        {lcpPreloadUrl && <link rel="preload" as="image" href={lcpPreloadUrl} fetchPriority="high" />}
        <div className={styles.pageContainer}>
          <PlaylistDetailContent
            playlistUuid={params.playlist_uuid}
            playlistsBasePath={playlistsBasePath}
            boardConfig={{
              boardType: parsed.board_name,
              layoutId: parsed.layout_id,
              sizeId: parsed.size_id,
            }}
            initialMyBoards={initialMyBoards}
          />
        </div>
      </I18nProvider>
    );
  } catch (error) {
    console.error('Error loading playlist detail page:', error);
    notFound();
  }
}
