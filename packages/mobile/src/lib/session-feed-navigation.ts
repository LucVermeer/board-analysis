import { type useRouter } from 'expo-router';
import type { BoardName, SessionFeedItem, SessionFeedTickHighlight } from '@boardsesh/shared-schema';
import { getBoardConfigForPlaylist } from './playlists/board-details-for-playlist';

type Router = ReturnType<typeof useRouter>;

export function navigateToSessionFeedTick(router: Router, tick: SessionFeedTickHighlight | null | undefined): void {
  if (!tick) return;
  const boardConfig = getBoardConfigForPlaylist(tick.boardType, tick.layoutId);
  if (!boardConfig) return;

  router.push({
    pathname: '/(tabs)/climbs/[climbUuid]',
    params: {
      climbUuid: tick.climbUuid,
      boardName: boardConfig.boardName as BoardName,
      layoutId: String(boardConfig.layoutId),
      sizeId: String(boardConfig.sizeId),
      setIds: boardConfig.setIds.join(','),
      angle: String(tick.angle),
    },
  });
}

export function navigateToSessionFeedItem(router: Router, session: SessionFeedItem): void {
  router.push({ pathname: '/session/[sessionId]', params: { sessionId: session.sessionId } });
}
