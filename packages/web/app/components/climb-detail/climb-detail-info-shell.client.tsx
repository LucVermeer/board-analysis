'use client';

import React from 'react';
import ClimbCard from '@/app/components/climb-card/climb-card';
import ClimbDetailShellClient from './climb-detail-shell.client';
import { useBuildClimbDetailSections } from './build-climb-detail-sections';
import { useDoubleTapFavorite } from '@/app/components/climb-actions/use-double-tap-favorite';
import HeartAnimationOverlay from '@/app/components/climb-card/heart-animation-overlay';
import type { BoardDetails, Climb } from '@/app/lib/types';

type ClimbDetailInfoShellClientProps = {
  climb: Climb;
  boardDetails: BoardDetails;
  climbUuid: string;
  boardType: string;
  angle: number;
  currentClimbDifficulty?: string;
  boardName?: string;
};

export default function ClimbDetailInfoShellClient({
  climb,
  boardDetails,
  climbUuid,
  boardType,
  angle,
  currentClimbDifficulty,
  boardName,
}: ClimbDetailInfoShellClientProps) {
  const sections = useBuildClimbDetailSections({
    climb,
    climbUuid,
    boardType,
    angle,
    layoutId: boardDetails.layout_id,
    currentClimbDifficulty,
    boardName,
  });

  const { handleDoubleTap, showHeart, dismissHeart } = useDoubleTapFavorite({
    climbUuid: climb.uuid,
  });

  return (
    <ClimbDetailShellClient
      mode="info"
      aboveFold={
        <ClimbCard
          climb={climb}
          boardDetails={boardDetails}
          actions={[]}
          onCoverDoubleClick={handleDoubleTap}
          expandedContent={<HeartAnimationOverlay visible={showHeart} onAnimationEnd={dismissHeart} />}
        />
      }
      sections={sections}
    />
  );
}
