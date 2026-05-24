'use client';

import React, { useEffect } from 'react';
import type { BoardDetails, Climb } from '@/app/lib/types';
import ClimbDetailShellClient from '@/app/components/climb-detail/climb-detail-shell.client';
import { useBuildClimbDetailSections } from '@/app/components/climb-detail/build-climb-detail-sections';

type PlayDrawerContentProps = {
  climb: Climb;
  boardType: string;
  angle: number;
  layoutId: number;
  viewerBoardDetails: BoardDetails;
  aboveFold: React.ReactNode;
  sectionsEnabled: boolean;
  paperRef: React.RefObject<HTMLDivElement | null>;
};

const PlayDrawerContent = React.memo<PlayDrawerContentProps>(
  ({ climb, boardType, angle, layoutId, viewerBoardDetails, aboveFold, sectionsEnabled, paperRef }) => {
    const sections = useBuildClimbDetailSections({
      climb,
      climbUuid: climb.uuid,
      boardType,
      angle,
      layoutId,
      viewerBoardDetails,
      currentClimbDifficulty: climb.difficulty ?? undefined,
      boardName: boardType,
      enabled: sectionsEnabled,
    });

    // When the active climb changes (e.g. tapping a card in the Similar
    // climbs slider activates a new climb), reset the drawer's scroll
    // position to the top so the user sees the new climb's header /
    // board first instead of landing mid-scroll on whatever section
    // they were on in the previous climb. The data-scroll-container
    // attribute is set by ClimbDetailShellClient on its mobileScrollLayout
    // wrapper (climb-detail-shell.client.tsx:38). Scope to paperRef so we
    // don't accidentally grab a foreign element that happens to carry the
    // same attribute elsewhere on the page.
    useEffect(() => {
      const scrollContainer = paperRef.current?.querySelector<HTMLElement>('[data-scroll-container]');
      if (scrollContainer) {
        scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, [climb.uuid, paperRef]);

    return <ClimbDetailShellClient mode="play" sections={sections} aboveFold={aboveFold} />;
  },
);
PlayDrawerContent.displayName = 'PlayDrawerContent';

export default PlayDrawerContent;
