'use client';

import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import LocaleLink from '@/app/components/i18n/locale-link';
import { useQueueActions, useSessionData } from '../graphql-queue';
import { constructPlayUrlWithSlugs, getContextAwareClimbViewUrl } from '@/app/lib/url-utils';
import type { BoardDetails } from '@/app/lib/types';
import { useResolvedBoardDetails } from '@/app/hooks/use-resolved-board-details';
import FastForwardOutlined from '@mui/icons-material/FastForwardOutlined';
import { track } from '@/app/lib/analytics';
import IconButton, { type IconButtonProps } from '@mui/material/IconButton';

type NextClimbButtonProps = {
  navigate: boolean;
  boardDetails?: BoardDetails;
};

const NextButton = ({ ariaLabel, ...props }: IconButtonProps & { ariaLabel: string }) => (
  <IconButton {...props} aria-label={ariaLabel}>
    <FastForwardOutlined />
  </IconButton>
);

/**
 * Bar next-climb button.
 *
 * Queue-control-bar pivot (simplified): any participant — driver or
 * non-driver, solo or party — can tap this and the wall climb advances
 * instantly to the next queue item. There is no hold-to-confirm gate
 * and no driver transfer; the presser stays a non-driver, only the shared
 * queue position moves. `setCurrentClimbQueueItem` updates the queue
 * state (and broadcasts via the persistent-session subscription when
 * party is active) but never calls `takeControl`.
 */
export default function NextClimbButton({ navigate, boardDetails }: NextClimbButtonProps) {
  const { t } = useTranslation('climbs');
  const ariaLabel = t('actions.navigation.nextClimb');
  const { setCurrentClimbQueueItem, getNextClimbQueueItem } = useQueueActions();
  const { viewOnlyMode } = useSessionData();
  const { rawParams, angle, pathname, searchParams, isPlayPage, resolvedDetails } =
    useResolvedBoardDetails(boardDetails);

  const nextClimb = getNextClimbQueueItem();

  const buildClimbUrl = () => {
    if (!nextClimb) return '';
    let climbUrl = '';

    if (isPlayPage) {
      if (resolvedDetails.layout_name && resolvedDetails.size_name && resolvedDetails.set_names) {
        climbUrl = constructPlayUrlWithSlugs(
          resolvedDetails.board_name,
          resolvedDetails.layout_name,
          resolvedDetails.size_name,
          resolvedDetails.size_description,
          resolvedDetails.set_names,
          angle,
          nextClimb.climb.uuid,
          nextClimb.climb.name,
        );
      } else {
        climbUrl = `/${rawParams.board_name}/${rawParams.layout_id}/${rawParams.size_id}/${rawParams.set_ids}/${rawParams.angle}/play/${nextClimb.climb.uuid}`;
      }

      const queryString = searchParams.toString();
      if (queryString) {
        climbUrl = `${climbUrl}?${queryString}`;
      }
    } else {
      climbUrl = getContextAwareClimbViewUrl(
        pathname,
        resolvedDetails,
        angle,
        nextClimb.climb.uuid,
        nextClimb.climb.name,
      );
    }

    return climbUrl;
  };

  const fireAdvance = useCallback(() => {
    if (!nextClimb) return;
    setCurrentClimbQueueItem(nextClimb);
    track('Queue Navigation', {
      direction: 'next',
      method: 'button',
      boardLayout: boardDetails?.layout_name || '',
    });
    if (navigate && isPlayPage) {
      const url = buildClimbUrl();
      if (url) window.history.pushState(null, '', url);
    }
    // buildClimbUrl is a closure over current state; recreating each fire is
    // intentional. nextClimb is the only ref-stable input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextClimb, navigate, isPlayPage, setCurrentClimbQueueItem, boardDetails?.layout_name]);

  if (!viewOnlyMode && navigate && nextClimb) {
    if (isPlayPage) {
      return <NextButton ariaLabel={ariaLabel} onClick={fireAdvance} />;
    }
    const climbUrl = buildClimbUrl();
    return (
      <LocaleLink href={climbUrl} prefetch={false} onClick={fireAdvance}>
        <NextButton ariaLabel={ariaLabel} />
      </LocaleLink>
    );
  }
  return <NextButton ariaLabel={ariaLabel} onClick={fireAdvance} disabled={!nextClimb || viewOnlyMode} />;
}
