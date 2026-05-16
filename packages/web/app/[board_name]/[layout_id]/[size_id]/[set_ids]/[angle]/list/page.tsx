import React from 'react';

import { notFound, permanentRedirect } from 'next/navigation';
import type { BoardRouteParametersWithUuid, SearchRequestPagination } from '@/app/lib/types';
import { constructClimbListWithSlugs } from '@/app/lib/url-utils';
import { parseRouteParams } from '@/app/lib/url-utils.server';
import BoardPageClimbsList from '@/app/components/board-page/board-page-climbs-list';
import { getBoardDetailsForBoard } from '@/app/lib/board-utils';
import { fetchListPageData } from '@/app/lib/data/list-page-data.server';

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
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
              acc[key] = String(value);
            } else if (Array.isArray(value)) {
              acc[key] = value.join(',');
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

  const listData = await fetchListPageData(parsedParams, searchParams);
  if (!listData) return notFound();
  const { boardDetails, searchResponse, preloadUrl } = listData;

  return (
    <>
      {preloadUrl && <link rel="preload" as="image" href={preloadUrl} fetchPriority="high" />}
      <BoardPageClimbsList
        {...parsedParams}
        boardDetails={boardDetails}
        initialClimbs={searchResponse.climbs}
        initialHasMore={searchResponse.hasMore}
      />
    </>
  );
}
