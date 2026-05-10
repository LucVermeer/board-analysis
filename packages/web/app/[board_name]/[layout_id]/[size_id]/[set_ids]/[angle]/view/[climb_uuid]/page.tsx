import React from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import type { BoardRouteParametersWithUuid } from '@/app/lib/types';
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
import { fetchClimbDetailData } from '@/app/lib/data/climb-detail-data.server';
import ClimbDetailPageServer from '@/app/components/climb-detail/climb-detail-page.server';
import { scheduleOverlayWarming } from '@/app/lib/warm-overlay-cache';
import { buildOgBoardRenderUrl } from '@/app/components/board-renderer/util';
import { getServerTranslation } from '@/app/lib/i18n/server';
import { createPageMetadata } from '@/app/lib/seo/metadata';

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

export default async function DynamicResultsPage(props: { params: Promise<BoardRouteParametersWithUuid> }) {
  const params = await props.params;

  try {
    const { parsedParams, isNumericFormat } = await parseRouteParams(params);

    if (isNumericFormat || isUuidOnly(params.climb_uuid)) {
      const currentClimb = await getClimb(parsedParams);
      const layouts = await import('@/app/lib/data/queries').then((m) => m.getLayouts(parsedParams.board_name));
      const sizes = await import('@/app/lib/data/queries').then((m) =>
        m.getSizes(parsedParams.board_name, parsedParams.layout_id),
      );
      const sets = await import('@/app/lib/data/queries').then((m) =>
        m.getSets(parsedParams.board_name, parsedParams.layout_id, parsedParams.size_id),
      );

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

    const boardDetails = getBoardDetailsForBoard(parsedParams);
    const [currentClimb, detailData] = await Promise.all([
      getClimb(parsedParams),
      fetchClimbDetailData({
        boardName: parsedParams.board_name,
        climbUuid: parsedParams.climb_uuid,
        angle: parsedParams.angle,
      }),
    ]);

    if (!currentClimb) {
      notFound();
    }

    scheduleOverlayWarming({ boardDetails, climbs: [currentClimb], variant: 'full' });

    const climbWithProcessedData = {
      ...currentClimb,
      communityGrade: detailData.communityGrade,
    };

    return (
      <ClimbDetailPageServer
        climb={climbWithProcessedData}
        boardDetails={boardDetails}
        climbUuid={parsedParams.climb_uuid}
        boardType={parsedParams.board_name}
        angle={parsedParams.angle}
        currentClimbDifficulty={currentClimb.difficulty ?? undefined}
        boardName={parsedParams.board_name}
      />
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
