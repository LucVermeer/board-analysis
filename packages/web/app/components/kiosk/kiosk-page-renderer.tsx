// Server renderer shared by /kiosk/[gym_slug] and /kiosk/[gym_slug]/[kiosk_slug].
//
// Fetches the kiosk over anonymous HTTP GraphQL (revalidate 60 — the config
// poll in kiosk-reliability.tsx reloads open TVs within 5 minutes of an edit),
// seeds each board's latest climb from boardRecentClimbs (no-store), and
// server-renders the full preset grid with raster placeholders. The client
// presence hub then attaches one live subscription per board over a single
// graphql-ws connection.

import React, { cache } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { kioskPresetForBoardCount } from '@boardsesh/kiosk';
import { BOARD_RECENT_CLIMBS, GET_GYM_KIOSK } from '@boardsesh/graphql/operations';
import type { BoardPresenceClimb, GymKiosk, GymKioskBoard } from '@boardsesh/shared-schema';
import { getGraphQLHttpUrl } from '@/app/lib/graphql/client';
import { getBoardDetailsForBoard } from '@/app/lib/board-utils';
import { getLocale } from '@/app/lib/i18n/get-locale';
import { getServerTranslation } from '@/app/lib/i18n/server';
import { createNoIndexMetadata } from '@/app/lib/seo/metadata';
import type { BoardDetails } from '@/app/lib/types';
import I18nProvider from '../providers/i18n-provider';
import { buildBoardRenderUrl, toFlatFrames } from '../board-renderer/util';
import { buildKioskViewModel } from './kiosk-view-model';
import KioskThemeScope from './kiosk-theme-scope';
import KioskPresenceHub from './presence/kiosk-presence-hub';
import KioskHeader from './kiosk-header';
import KioskLayout from './kiosk-layout';
import KioskAttribution from './kiosk-attribution';
import KioskReliability from './kiosk-reliability';
import KioskRetryScreen from './kiosk-retry-screen';
import KioskAnalytics from './kiosk-analytics';
import BoardSlot from './board-slot/board-slot';
import LeaderboardRail from './leaderboard-rail/leaderboard-rail';
import layoutStyles from './kiosk-layout.module.css';

const KIOSK_REVALIDATE_SECONDS = 60;

/**
 * A transient failure ('error': backend down, HTTP error, GraphQL resolver
 * error) is distinguished from a genuine "no such kiosk" ('ok' with a null
 * kiosk). A TV is unattended, so only the latter may 404 — a blip during e.g.
 * the 04:00 reload must land on the self-healing retry screen, never brick
 * the TV on a chrome-less 404 page with no reliability layer.
 */
export type GymKioskFetchResult = { status: 'ok'; kiosk: GymKiosk | null } | { status: 'error' };

/**
 * Anonymous, request-deduped (React cache) kiosk fetch shared by the page body
 * and generateMetadata. Mirrors `resolveBoardBySlug`'s transport.
 */
export const fetchGymKiosk = cache(async (gymSlug: string, kioskSlug: string | null): Promise<GymKioskFetchResult> => {
  try {
    const response = await fetch(getGraphQLHttpUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: GET_GYM_KIOSK, variables: { gymSlug, kioskSlug } }),
      next: { revalidate: KIOSK_REVALIDATE_SECONDS },
    });
    if (!response.ok) return { status: 'error' };
    const payload = (await response.json()) as {
      data?: { gymKiosk?: GymKiosk | null } | null;
      errors?: unknown[];
    };
    // GraphQL-level errors (resolver crash) are transient too — a genuine
    // not-found/not-visible resolves successfully to `gymKiosk: null`.
    if (payload.data?.gymKiosk === undefined || (payload.errors?.length ?? 0) > 0) {
      return { status: 'error' };
    }
    return { status: 'ok', kiosk: payload.data.gymKiosk };
  } catch {
    return { status: 'error' };
  }
});

/** Latest climbs for a board (newest first; index 0 = current). Anonymous,
 * uncached — this is the SSR seed for what's lit right now. */
async function fetchInitialClimbs(boardId: number): Promise<BoardPresenceClimb[]> {
  try {
    const response = await fetch(getGraphQLHttpUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: BOARD_RECENT_CLIMBS, variables: { boardId } }),
      cache: 'no-store',
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as { data?: { boardRecentClimbs?: BoardPresenceClimb[] | null } };
    return payload.data?.boardRecentClimbs ?? [];
  } catch {
    return [];
  }
}

export async function buildKioskMetadata(gymSlug: string, kioskSlug: string | null): Promise<Metadata> {
  const [{ t, locale }, fetchResult] = await Promise.all([
    getServerTranslation('kiosk'),
    fetchGymKiosk(gymSlug, kioskSlug),
  ]);
  const path = kioskSlug === null ? `/kiosk/${gymSlug}` : `/kiosk/${gymSlug}/${kioskSlug}`;
  const kiosk = fetchResult.status === 'ok' ? fetchResult.kiosk : null;
  if (kiosk === null) {
    return createNoIndexMetadata({
      title: t('metadata.fallbackTitle'),
      description: t('metadata.fallbackDescription'),
      path,
      locale,
    });
  }
  return createNoIndexMetadata({
    title: t('metadata.title', { gymName: kiosk.gym.name, kioskName: kiosk.name }),
    description: t('metadata.description', { gymName: kiosk.gym.name }),
    path,
    locale,
  });
}

type RenderableSlot = {
  board: GymKioskBoard;
  boardDetails: BoardDetails;
  initialClimb: BoardPresenceClimb | null;
  initialClimbImageUrl: string | null;
  bareBoardImageUrl: string;
};

function resolveBoardDetails(board: GymKioskBoard): BoardDetails | null {
  try {
    return getBoardDetailsForBoard({
      board_name: board.boardType,
      layout_id: board.layoutId,
      size_id: board.sizeId,
      set_ids: board.setIds.split(',').map(Number),
    });
  } catch (error) {
    // An unknown layout/size/set combination (e.g. stale board config) drops
    // the slot instead of crashing the whole TV; the preset degrades below.
    console.warn(`[kiosk] Skipping board ${board.boardUuid}: no board details`, error);
    return null;
  }
}

export default async function KioskPageRenderer({ gymSlug, kioskSlug }: { gymSlug: string; kioskSlug: string | null }) {
  const fetchResult = await fetchGymKiosk(gymSlug, kioskSlug);

  // Transient failure (backend blip, network outage): render the self-healing
  // retry screen instead of 404ing — a bricked 404 on an unattended TV needs a
  // human with a remote. Default-branded theme scope: the gym's branding is in
  // the payload we just failed to fetch.
  if (fetchResult.status === 'error') {
    const retryLocale = await getLocale();
    return (
      <I18nProvider locale={retryLocale} namespaces={['common', 'kiosk']}>
        <KioskThemeScope gym={{}}>
          <KioskRetryScreen />
        </KioskThemeScope>
      </I18nProvider>
    );
  }

  const kiosk = fetchResult.kiosk;
  if (kiosk === null) {
    notFound();
  }

  const locale = await getLocale();
  const { t } = await getServerTranslation('kiosk');
  const viewModel = buildKioskViewModel(kiosk);

  const slots: RenderableSlot[] = (
    await Promise.all(
      viewModel.boards.map(async (board): Promise<RenderableSlot | null> => {
        const boardDetails = resolveBoardDetails(board);
        if (boardDetails === null) return null;

        const recentClimbs = await fetchInitialClimbs(board.boardId);
        const initialClimb = recentClimbs[0] ?? null;
        const flatFrames = toFlatFrames(initialClimb?.frames, boardDetails.board_name);
        return {
          board,
          boardDetails,
          initialClimb,
          initialClimbImageUrl:
            initialClimb === null || flatFrames.length === 0
              ? null
              : buildBoardRenderUrl(boardDetails, flatFrames, { includeBackground: true }),
          bareBoardImageUrl: buildBoardRenderUrl(boardDetails, '', { includeBackground: true }),
        };
      }),
    )
  ).filter((slot): slot is RenderableSlot => slot !== null);

  // Preset from the boards that actually render: the backend already omitted
  // dead/hidden slots; a board-details failure degrades the same way here.
  const preset = kioskPresetForBoardCount(slots.length);
  const distinctBoardIds = Array.from(new Set(slots.map((slot) => slot.board.boardId)));

  const rail =
    viewModel.leaderboard === null ? null : (
      <LeaderboardRail leaderboard={viewModel.leaderboard} boards={viewModel.boards} />
    );

  return (
    <I18nProvider locale={locale} namespaces={['common', 'kiosk']}>
      <KioskThemeScope gym={kiosk.gym}>
        <KioskAnalytics />
        <KioskReliability gymSlug={gymSlug} kioskSlug={kioskSlug} initialUpdatedAt={kiosk.updatedAt} />
        <KioskPresenceHub boardIds={distinctBoardIds}>
          <div className={layoutStyles.root}>
            <KioskHeader gymName={kiosk.gym.name} logoUrl={kiosk.gym.logoUrl ?? null} kioskName={kiosk.name} />
            {preset === null ? (
              <div className={layoutStyles.setupPlaceholder}>
                <h1 className={layoutStyles.setupTitle}>{t('setup.title')}</h1>
                <p className={layoutStyles.setupBody}>{t('setup.body')}</p>
              </div>
            ) : (
              <KioskLayout preset={preset} rail={rail}>
                {slots.map((slot) => (
                  <BoardSlot
                    key={slot.board.boardUuid}
                    boardId={slot.board.boardId}
                    boardName={slot.board.name}
                    angle={slot.board.angle}
                    boardDetails={slot.boardDetails}
                    initialClimb={slot.initialClimb}
                    initialClimbImageUrl={slot.initialClimbImageUrl}
                    bareBoardImageUrl={slot.bareBoardImageUrl}
                  />
                ))}
              </KioskLayout>
            )}
          </div>
        </KioskPresenceHub>
        <KioskAttribution hasRail={rail !== null && preset !== null} />
      </KioskThemeScope>
    </I18nProvider>
  );
}
