import React from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { SearchRequestPagination, Climb } from '@/app/lib/types';
import { parsedRouteSearchParamsToSearchParams } from '@/app/lib/url-utils';
import { resolveBoardBySlug, boardToRouteParams } from '@/app/lib/board-slug-utils';
import BoardPageClimbsList from '@/app/components/board-page/board-page-climbs-list';
import { cachedSearchClimbs } from '@/app/lib/db/queries/climbs/search-climbs';
import { hasUserSpecificFilters } from '@/app/lib/list-page-cache';
import { getBoardDetailsForBoard } from '@/app/lib/board-utils';
import { MAX_PAGE_SIZE, SSR_INITIAL_PAGE_SIZE } from '@/app/components/board-page/constants';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/lib/auth/auth-options';
import { scheduleOverlayWarming } from '@/app/lib/warm-overlay-cache';
import { buildOverlayUrl } from '@/app/components/board-renderer/util';
import { formatBoardDisplayName } from '@/app/lib/string-utils';
import { createPageMetadata } from '@/app/lib/seo/metadata';
import { getServerTranslation } from '@/app/lib/i18n/server';

type BoardSlugListPageProps = {
  params: Promise<{ board_slug: string; angle: string }>;
  searchParams: Promise<SearchRequestPagination>;
};

export async function generateMetadata(props: BoardSlugListPageProps): Promise<Metadata> {
  const params = await props.params;
  const { t, locale } = await getServerTranslation('climbs');

  try {
    const board = await resolveBoardBySlug(params.board_slug);
    if (!board) {
      return createPageMetadata({
        title: t('metadata.list.fallbackTitle'),
        description: t('metadata.list.fallbackDescription'),
        locale,
      });
    }

    const boardName = formatBoardDisplayName(board.boardType);
    const angle = params.angle;

    return createPageMetadata({
      title: t('metadata.list.title', { boardName, angle }),
      description: t('metadata.list.description', { boardName, angle }),
      path: `/b/${params.board_slug}/${angle}/list`,
      locale,
    });
  } catch {
    return createPageMetadata({
      title: t('metadata.list.fallbackTitle'),
      description: t('metadata.list.fallbackDescription'),
      locale,
    });
  }
}

export default async function BoardSlugListPage(props: BoardSlugListPageProps) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);

  const board = await resolveBoardBySlug(params.board_slug);
  if (!board) {
    return notFound();
  }

  const parsedParams = boardToRouteParams(board, Number(params.angle));
  const searchParamsObject: SearchRequestPagination = parsedRouteSearchParamsToSearchParams(searchParams);

  const requestedPage = Number(searchParamsObject.page);
  if (requestedPage === 0) {
    // First-viewport SSR: ship a small initial batch and let SWR fetch the rest.
    searchParamsObject.pageSize = SSR_INITIAL_PAGE_SIZE;
  } else {
    // page>0 (deep-link): aggregate pages 0..N so SSR matches what SWR will
    // fetch, preventing a flicker as cached pages backfill.
    const requestedPageSize = (requestedPage + 1) * Number(searchParamsObject.pageSize);
    searchParamsObject.pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);
  }
  searchParamsObject.page = 0;

  const hasProgressFilters = hasUserSpecificFilters(searchParamsObject);

  const isDefaultSearch =
    !searchParamsObject.gradeAccuracy &&
    !searchParamsObject.minGrade &&
    !searchParamsObject.maxGrade &&
    !searchParamsObject.minAscents &&
    !searchParamsObject.minRating &&
    !searchParamsObject.name &&
    (!searchParamsObject.settername || searchParamsObject.settername.length === 0) &&
    (searchParamsObject.sortBy || 'ascents') === 'ascents' &&
    (searchParamsObject.sortOrder || 'desc') === 'desc' &&
    !searchParamsObject.onlyTallClimbs &&
    (!searchParamsObject.holdsFilter || Object.keys(searchParamsObject.holdsFilter).length === 0) &&
    !hasProgressFilters;

  let boardDetails;
  try {
    boardDetails = getBoardDetailsForBoard(parsedParams);
  } catch {
    return notFound();
  }

  // Resolve userId for personal progress filters
  let userId: string | undefined;
  if (hasProgressFilters) {
    const session = await getServerSession(authOptions);
    userId = session?.user?.id;
  }

  let searchResponse: { climbs: Climb[]; hasMore: boolean };

  try {
    searchResponse = await cachedSearchClimbs(parsedParams, searchParamsObject, isDefaultSearch, userId, {
      cacheable: !hasProgressFilters,
    });
  } catch (error) {
    console.error('Error fetching climb search results:', error);
    searchResponse = { climbs: [], hasMore: false };
  }

  scheduleOverlayWarming({ boardDetails, climbs: searchResponse.climbs, variant: 'thumbnail' });

  const firstClimb = searchResponse.climbs[0];
  const preloadUrl = firstClimb?.frames ? buildOverlayUrl(boardDetails, firstClimb.frames, true) : null;

  return (
    <>
      {preloadUrl && <link rel="preload" as="image" href={preloadUrl} fetchPriority="high" />}
      <BoardPageClimbsList {...parsedParams} boardDetails={boardDetails} initialClimbs={searchResponse.climbs} />
    </>
  );
}
