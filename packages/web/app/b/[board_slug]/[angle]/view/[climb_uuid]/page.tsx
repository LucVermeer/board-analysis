import React from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { resolveBoardBySlug, boardToRouteParams } from '@/app/lib/board-slug-utils';
import { getBoardDetailsForBoard } from '@/app/lib/board-utils';
import { getClimb } from '@/app/lib/data/queries';

import ClimbDetailPageServer from '@/app/components/climb-detail/climb-detail-page.server';
import { fetchClimbDetailData } from '@/app/lib/data/climb-detail-data.server';
import { scheduleOverlayWarming } from '@/app/lib/warm-overlay-cache';
import { extractUuidFromSlug } from '@/app/lib/url-utils';
import { buildOgBoardRenderUrl } from '@/app/components/board-renderer/util';
import { getServerTranslation } from '@/app/lib/i18n/server';
import { createPageMetadata } from '@/app/lib/seo/metadata';

type BoardSlugViewPageProps = {
  params: Promise<{ board_slug: string; angle: string; climb_uuid: string }>;
};

export async function generateMetadata(props: BoardSlugViewPageProps): Promise<Metadata> {
  const params = await props.params;
  const { t, locale } = await getServerTranslation('climbs');

  try {
    const board = await resolveBoardBySlug(params.board_slug);
    if (!board) {
      return createPageMetadata({
        title: t('metadata.view.fallbackTitle'),
        description: t('metadata.view.fallbackDescription'),
        locale,
        robots: { index: false, follow: true },
      });
    }

    const parsedParams = {
      ...boardToRouteParams(board, Number(params.angle)),
      climb_uuid: extractUuidFromSlug(params.climb_uuid),
    };

    const boardDetails = getBoardDetailsForBoard(parsedParams);
    const currentClimb = await getClimb(parsedParams);

    const climbName = currentClimb.name || `${boardDetails.board_name} Climb`;
    const climbGrade = currentClimb.difficulty || 'Unknown Grade';
    const setter = currentClimb.setter_username || 'Unknown Setter';
    const quality = currentClimb.quality_average || 0;
    const ascents = currentClimb.ascensionist_count || 0;
    const ogImagePath = buildOgBoardRenderUrl(boardDetails, currentClimb.frames);

    return createPageMetadata({
      title: t('metadata.view.title', { climbName, grade: climbGrade }),
      description: t('metadata.view.description', { climbName, grade: climbGrade, setter, quality, ascents }),
      path: `/b/${params.board_slug}/${params.angle}/view/${params.climb_uuid}`,
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

export default async function BoardSlugViewPage(props: BoardSlugViewPageProps) {
  const params = await props.params;

  const board = await resolveBoardBySlug(params.board_slug);
  if (!board) {
    return notFound();
  }

  const parsedParams = {
    ...boardToRouteParams(board, Number(params.angle)),
    climb_uuid: extractUuidFromSlug(params.climb_uuid),
  };

  try {
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
    console.error('Error fetching climb view:', error);
    notFound();
  }
}
