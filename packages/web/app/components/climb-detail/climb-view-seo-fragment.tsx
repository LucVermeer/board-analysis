import React from 'react';
import Box from '@mui/material/Box';
import { visuallyHidden } from '@mui/utils';
import type { BoardDetails, Climb } from '@/app/lib/types';
import { getServerTranslation } from '@/app/lib/i18n/server';

type ClimbViewSeoFragmentProps = {
  climb: Climb;
  boardDetails: BoardDetails;
};

/**
 * Server-rendered fragment that gives crawlers (and the brief pre-hydration
 * paint) a heading and metadata about the climb the /view/{uuid} route is
 * about, before the PlayViewDrawer hydrates and covers the viewport.
 *
 * Visually hidden via the standard sr-only pattern so it doesn't double up
 * with the drawer's own header once the page is interactive.
 */
export default async function ClimbViewSeoFragment({ climb, boardDetails }: ClimbViewSeoFragmentProps) {
  const { t } = await getServerTranslation('climbs');
  const grade = climb.difficulty ?? '';
  const setter = climb.setter_username ?? '';
  const layoutName = boardDetails.layout_name ?? '';
  const ascents = climb.ascensionist_count ?? 0;

  const heading = t('metadata.view.seoHeading', { climbName: climb.name, grade });
  const summary = t('metadata.view.seoSummary', { boardName: boardDetails.board_name, layoutName });
  const setterSuffix = setter ? t('metadata.view.seoSetterSuffix', { setter }) : '';
  const ascentsSuffix = ascents > 0 ? t('metadata.view.seoAscentsSuffix', { ascents }) : '';

  return (
    <Box component="section" sx={visuallyHidden}>
      <h1>{heading}</h1>
      <p>
        {summary}
        {setterSuffix}
        {ascentsSuffix}.
      </p>
    </Box>
  );
}
