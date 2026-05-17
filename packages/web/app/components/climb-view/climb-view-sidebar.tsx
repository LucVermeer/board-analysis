'use client';

import React from 'react';
import CollapsibleSection from '@/app/components/collapsible-section/collapsible-section';
import { useBuildClimbDetailSections } from '@/app/components/climb-detail/build-climb-detail-sections';
import type { Climb } from '@/app/lib/types';

type ClimbViewSidebarProps = {
  climb: Climb;
  climbUuid: string;
  boardType: string;
  angle: number;
  layoutId: number;
  currentClimbDifficulty?: string;
  boardName?: string;
};

export default function ClimbViewSidebar({
  climb,
  climbUuid,
  boardType,
  angle,
  layoutId,
  currentClimbDifficulty,
  boardName,
}: ClimbViewSidebarProps) {
  const sections = useBuildClimbDetailSections({
    climb,
    climbUuid,
    boardType,
    angle,
    layoutId,
    currentClimbDifficulty,
    boardName,
  });

  return <CollapsibleSection sections={sections} />;
}
