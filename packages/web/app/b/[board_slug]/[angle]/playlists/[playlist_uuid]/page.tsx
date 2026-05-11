import React from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { resolveBoardBySlug } from '@/app/lib/board-slug-utils';
import { constructBoardSlugPlaylistsUrl } from '@/app/lib/url-utils';
import { getServerAuthToken } from '@/app/lib/auth/server-auth';
import { serverMyBoards, serverPlaylist, serverPlaylistClimbs } from '@/app/lib/graphql/server-cached-client';
import { generatePlaylistMetadata } from '@/app/lib/seo/playlist-metadata';
import { getLocale } from '@/app/lib/i18n/get-locale';
import I18nProvider from '@/app/components/providers/i18n-provider';
import PlaylistDetailContent from '@/app/playlists/[playlist_uuid]/playlist-detail-content';
import { getPlaylistLcpPreloadUrl } from '@/app/lib/lcp-preload-url';
import { findMatchingBoard } from '@/app/lib/find-matching-board';
import { getDefaultAngleForBoard } from '@/app/lib/board-config-for-playlist';
import styles from '@/app/components/library/playlist-view.module.css';

type PlaylistDetailPageProps = {
  params: Promise<{ board_slug: string; angle: string; playlist_uuid: string }>;
};

export async function generateMetadata(props: PlaylistDetailPageProps): Promise<Metadata> {
  const params = await props.params;
  return generatePlaylistMetadata(params.playlist_uuid);
}

export default async function BoardSlugPlaylistDetailPage(props: PlaylistDetailPageProps) {
  const params = await props.params;

  const board = await resolveBoardBySlug(params.board_slug);
  if (!board) {
    return notFound();
  }

  const playlistsBasePath = constructBoardSlugPlaylistsUrl(params.board_slug, Number(params.angle));

  const authToken = await getServerAuthToken();
  const locale = await getLocale();
  const [initialMyBoards, initialPlaylist] = await Promise.all([
    authToken ? serverMyBoards(authToken) : null,
    serverPlaylist(authToken, params.playlist_uuid),
  ]);

  // Only seed initialClimbs when we can guarantee the client's first query
  // key matches what we fetched. The client keys by `selectedBoard.uuid`,
  // and selectedBoard is resolved synchronously from `initialMyBoards` via
  // `findMatchingBoard(boardSlug)`. If we can't pre-resolve that match
  // (e.g. unauthenticated user, no `initialMyBoards`), the client's first
  // render keys to `'all'` and a board-filtered SSR payload would land in
  // the wrong cache slot.
  //
  // We also include the full filter tuple (sizeId/setIds/angle) so the SSR
  // payload exactly matches what the client `queryFn` would request — the
  // backend narrows results by all five fields, not just boardName+layoutId.
  const matchedBoard = findMatchingBoard(initialMyBoards, params.board_slug);
  const initialClimbs =
    initialPlaylist && matchedBoard
      ? await serverPlaylistClimbs(authToken, {
          playlistId: params.playlist_uuid,
          boardName: matchedBoard.boardType,
          layoutId: matchedBoard.layoutId,
          sizeId: matchedBoard.sizeId,
          setIds: matchedBoard.setIds,
          angle: matchedBoard.angle ?? getDefaultAngleForBoard(matchedBoard.boardType),
          page: 0,
          pageSize: 20,
        })
      : null;

  const lcpPreloadUrl = getPlaylistLcpPreloadUrl({
    boardType: board.boardType,
    layoutId: board.layoutId,
    sizeId: board.sizeId,
    setIds: board.setIds ? board.setIds.split(',').map(Number).filter(Number.isFinite) : null,
  });

  return (
    <I18nProvider locale={locale} namespaces={['playlists']}>
      {lcpPreloadUrl && <link rel="preload" as="image" href={lcpPreloadUrl} fetchPriority="high" />}
      <div className={styles.pageContainer}>
        <PlaylistDetailContent
          playlistUuid={params.playlist_uuid}
          playlistsBasePath={playlistsBasePath}
          boardSlug={params.board_slug}
          initialMyBoards={initialMyBoards}
          initialPlaylist={initialPlaylist}
          initialClimbs={initialClimbs}
        />
      </div>
    </I18nProvider>
  );
}
