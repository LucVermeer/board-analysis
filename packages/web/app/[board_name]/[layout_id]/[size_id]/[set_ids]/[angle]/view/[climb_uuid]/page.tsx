import React from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import type { BoardRouteParametersWithUuid, SearchRequestPagination } from '@/app/lib/types';
import { getClimb } from '@/app/lib/data/queries';
import { getBoardDetailsForBoard } from '@/app/lib/board-utils';
import {
  constructClimbViewUrl,
  isUuidOnly,
  constructClimbViewUrlWithSlugs,
  tryConstructSlugViewUrl,
} from '@/app/lib/url-utils';
import { parseRouteParams } from '@/app/lib/url-utils.server';

import type { Metadata } from 'next';
import BoardPageClimbsList from '@/app/components/board-page/board-page-climbs-list';
import { fetchListPageData } from '@/app/lib/data/list-page-data.server';
import { buildOgBoardRenderUrl } from '@/app/components/board-renderer/util';
import { getServerTranslation } from '@/app/lib/i18n/server';
import { createPageMetadata } from '@/app/lib/seo/metadata';
import ClimbViewSeoFragment from '@/app/components/climb-detail/climb-view-seo-fragment';

export async function generateMetadata(props: { params: Promise<BoardRouteParametersWithUuid> }): Promise<Metadata> {
  const params = await props.params;
  const { t, locale } = await getServerTranslation('climbs');

  try {
    const { parsedParams } = await parseRouteParams(params);
    const boardDetails = getBoardDetailsForBoard(parsedParams);
    const currentClimb = await getClimb(parsedParams);

    const climbName = currentClimb.name || `${boardDetails.board_name} Climb`;
    const climbGrade = currentClimb.difficulty || 'Unknown Grade';
    const setter = currentClimb.setter_username || 'Unknown Setter';
    const quality = currentClimb.quality_average || 0;
    const ascents = currentClimb.ascensionist_count || 0;
    const climbUrl =
      tryConstructSlugViewUrl(
        parsedParams.board_name,
        parsedParams.layout_id,
        parsedParams.size_id,
        parsedParams.set_ids,
        parsedParams.angle,
        parsedParams.climb_uuid,
        climbName,
      ) ?? constructClimbViewUrl(parsedParams, parsedParams.climb_uuid, climbName);

    const ogImagePath = buildOgBoardRenderUrl(boardDetails, currentClimb.frames);

    return createPageMetadata({
      title: t('metadata.view.title', { climbName, grade: climbGrade }),
      description: t('metadata.view.description', { climbName, grade: climbGrade, setter, quality, ascents }),
      path: climbUrl,
      locale,
      imagePath: ogImagePath,
      imageAlt: t('metadata.view.imageAlt', { climbName, grade: climbGrade, boardName: boardDetails.board_name }),
    });
  } catch {
    return createPageMetadata({
      title: t('metadata.view.fallbackTitle'),
      description: t('metadata.view.fallbackDescription'),
      locale,
      robots: { index: false, follow: true },
    });
  }
}

export default async function ClimbViewPage(props: {
  params: Promise<BoardRouteParametersWithUuid>;
  searchParams: Promise<SearchRequestPagination>;
}) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);

  try {
    const { parsedParams, isNumericFormat } = await parseRouteParams(params);
    const needsSlugRedirect = isNumericFormat || isUuidOnly(params.climb_uuid);

    // Fetch the climb once. On the redirect path we use its name to build the
    // slug URL; on the normal path we pass it through to the SEO fragment and
    // the drawer.
    const currentClimb = await getClimb(parsedParams);
    if (!currentClimb) notFound();

    if (needsSlugRedirect) {
      const queries = await import('@/app/lib/data/queries');
      const [layouts, sizes, sets] = await Promise.all([
        queries.getLayouts(parsedParams.board_name),
        queries.getSizes(parsedParams.board_name, parsedParams.layout_id),
        queries.getSets(parsedParams.board_name, parsedParams.layout_id, parsedParams.size_id),
      ]);

      const layout = layouts.find((l) => l.id === parsedParams.layout_id);
      const size = sizes.find((s) => s.id === parsedParams.size_id);
      const selectedSets = sets.filter((s) => parsedParams.set_ids.includes(s.id));

      if (layout && size && selectedSets.length > 0) {
        const newUrl = constructClimbViewUrlWithSlugs(
          parsedParams.board_name,
          layout.name,
          size.name,
          size.description,
          selectedSets.map((s) => s.name),
          parsedParams.angle,
          parsedParams.climb_uuid,
          currentClimb.name,
        );
        permanentRedirect(newUrl);
      }
    }

    const listData = await fetchListPageData(parsedParams, searchParams);
    if (!listData) notFound();
    const { boardDetails, searchResponse, preloadUrl } = listData;

    return (
      <>
        {preloadUrl && <link rel="preload" as="image" href={preloadUrl} fetchPriority="high" />}
        <ClimbViewSeoFragment climb={currentClimb} boardDetails={boardDetails} />
        <BoardPageClimbsList
          {...parsedParams}
          boardDetails={boardDetails}
          initialClimbs={searchResponse.climbs}
          initialHasMore={searchResponse.hasMore}
          initialOpenClimb={currentClimb}
        />
      </>
    );
  } catch (error) {
    // Re-throw Next.js internal errors (permanentRedirect, notFound, etc.) so they
    // are handled correctly instead of being replaced by a 404.
    if (error !== null && typeof error === 'object' && 'digest' in error) {
      throw error;
    }
    console.error('Error fetching results or climb:', error);
    notFound();
  }
}
