import React from 'react';

import { notFound, permanentRedirect } from 'next/navigation';
import type { BoardRouteParametersWithUuid, SearchRequestPagination, BoardDetails, Climb } from '@/app/lib/types';
import { parsedRouteSearchParamsToSearchParams, constructClimbListWithSlugs } from '@/app/lib/url-utils';
import { parseRouteParams } from '@/app/lib/url-utils.server';
import BoardPageClimbsList from '@/app/components/board-page/board-page-climbs-list';
import { cachedSearchClimbs } from '@/app/lib/db/queries/climbs/search-climbs';
import { hasUserSpecificFilters } from '@/app/lib/list-page-cache';
import { getBoardDetailsForBoard } from '@/app/lib/board-utils';
import { MAX_PAGE_SIZE, SSR_INITIAL_PAGE_SIZE } from '@/app/components/board-page/constants';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/lib/auth/auth-options';
import { scheduleOverlayWarming } from '@/app/lib/warm-overlay-cache';
import { buildOverlayUrl } from '@/app/components/board-renderer/util';

export default async function DynamicResultsPage(props: {
  params: Promise<BoardRouteParametersWithUuid>;
  searchParams: Promise<SearchRequestPagination>;
}) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { parsedParams, isNumericFormat } = await parseRouteParams(params);

  // Redirect old numeric URLs to new slug format
  if (isNumericFormat) {
    const boardDetails = getBoardDetailsForBoard(parsedParams);

    if (boardDetails.layout_name && boardDetails.size_name && boardDetails.set_names) {
      const newUrl = constructClimbListWithSlugs(
        boardDetails.board_name,
        boardDetails.layout_name,
        boardDetails.size_name,
        boardDetails.size_description,
        boardDetails.set_names,
        parsedParams.angle,
      );

      // Preserve search parameters
      const searchString = new URLSearchParams(
        Object.entries(searchParams).reduce(
          (acc, [key, value]) => {
            if (value !== undefined) {
              acc[key] = String(value);
            }
            return acc;
          },
          {} as Record<string, string>,
        ),
      ).toString();
      const finalUrl = searchString ? `${newUrl}?${searchString}` : newUrl;

      permanentRedirect(finalUrl);
    }
  }

  const searchParamsObject: SearchRequestPagination = parsedRouteSearchParamsToSearchParams(searchParams);

  const requestedPage = Number(searchParamsObject.page);
  if (requestedPage === 0) {
    // First-viewport SSR: ship a small initial batch and let SWR fetch the rest.
    searchParamsObject.pageSize = SSR_INITIAL_PAGE_SIZE;
  } else {
    // page>0 (deep-link): aggregate pages 0..N so SSR matches what SWR will
    // fetch, preventing a flicker as cached pages backfill. Enforce max page
    // size to prevent excessive database queries.
    const requestedPageSize = (requestedPage + 1) * Number(searchParamsObject.pageSize);
    searchParamsObject.pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);
  }
  searchParamsObject.page = 0;

  const hasProgressFilters = hasUserSpecificFilters(searchParamsObject);

  // Check if this is a default search (no custom filters applied)
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

  let boardDetails: BoardDetails;

  try {
    boardDetails = getBoardDetailsForBoard(parsedParams);
  } catch (error) {
    console.error('Error resolving board details:', error);
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
    console.error(
      'Error fetching climb search results (degrading to empty results for SSR):',
      { boardName: parsedParams.board_name },
      error,
    );
    searchResponse = { climbs: [], hasMore: false };
  }

  scheduleOverlayWarming({ boardDetails, climbs: searchResponse.climbs, variant: 'thumbnail' });

  // Preload the first climb's thumbnail so the browser can fetch it before JS hydration.
  // The climb list is virtualized (client-only), so the LCP image isn't in the initial HTML.
  const firstClimb = searchResponse.climbs[0];
  const preloadUrl = firstClimb?.frames ? buildOverlayUrl(boardDetails, firstClimb.frames, true) : null;

  return (
    <>
      {preloadUrl && <link rel="preload" as="image" href={preloadUrl} fetchPriority="high" />}
      <BoardPageClimbsList {...parsedParams} boardDetails={boardDetails} initialClimbs={searchResponse.climbs} />
    </>
  );
}
