'use client';

import React, { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import LocaleLink from '@/app/components/i18n/locale-link';
import { useQueueActions, useSessionData } from '../graphql-queue';
import { constructPlayUrlWithSlugs, getContextAwareClimbViewUrl } from '@/app/lib/url-utils';
import type { BoardDetails } from '@/app/lib/types';
import { useResolvedBoardDetails } from '@/app/hooks/use-resolved-board-details';
import FastForwardOutlined from '@mui/icons-material/FastForwardOutlined';
import { track } from '@/app/lib/analytics';
import IconButton, { type IconButtonProps } from '@mui/material/IconButton';
import { useHoldToConfirm } from '@/app/lib/hooks/use-hold-to-confirm';
import { useSnackbar } from '../providers/snackbar-provider';

type NextClimbButtonProps = {
  navigate: boolean;
  boardDetails?: BoardDetails;
};

const NextButton = ({ ariaLabel, ...props }: IconButtonProps & { ariaLabel: string }) => (
  <IconButton {...props} aria-label={ariaLabel}>
    <FastForwardOutlined />
  </IconButton>
);

export default function NextClimbButton({ navigate, boardDetails }: NextClimbButtonProps) {
  const { t } = useTranslation('climbs');
  const ariaLabel = t('actions.navigation.nextClimb');
  const { setCurrentClimbQueueItem, getNextClimbQueueItem } = useQueueActions();
  const { viewOnlyMode, isPersistentSessionActive, isDriver } = useSessionData();
  const { showMessage } = useSnackbar();
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

  // Pivot rule 6: bar prev/next is the shared-queue advance gesture and is
  // available to everyone, but non-drivers in party must press-and-hold for
  // 3 seconds before the advance fires (climber-on-wall safety gate). The
  // driver press is instant.
  const requiresHold = isPersistentSessionActive && !isDriver;

  const fireAdvance = useCallback(() => {
    if (!nextClimb) return;
    setCurrentClimbQueueItem(nextClimb);
    track('Queue Navigation', {
      direction: 'next',
      method: requiresHold ? 'button_held' : 'button',
      boardLayout: boardDetails?.layout_name || '',
    });
    if (navigate && isPlayPage) {
      const url = buildClimbUrl();
      if (url) window.history.pushState(null, '', url);
    }
    // buildClimbUrl is a closure over current state; recreating each fire is
    // intentional. nextClimb is the only ref-stable input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextClimb, requiresHold, navigate, isPlayPage, setCurrentClimbQueueItem, boardDetails?.layout_name]);

  const { handlers, isHolding, secondsRemaining } = useHoldToConfirm({
    enabled: requiresHold,
    onConfirm: fireAdvance,
  });

  // Surface the hold countdown to the presser via the global Snackbar.
  // Spec: visible to the presser only (not broadcast to other party members);
  // copy is "Advancing in 3... 2... 1..." and auto-dismisses when the wall
  // advances or the user releases.
  useEffect(() => {
    if (isHolding && secondsRemaining != null && secondsRemaining > 0) {
      showMessage(`Advancing in ${secondsRemaining}…`, 'info', undefined, 1100);
    }
  }, [isHolding, secondsRemaining, showMessage]);

  if (!viewOnlyMode && navigate && nextClimb) {
    if (isPlayPage) {
      return <NextButton ariaLabel={ariaLabel} {...handlers} />;
    }
    const climbUrl = buildClimbUrl();
    // Hold-mode buttons can't live under <LocaleLink> (the link navigates on
    // tap and short-circuits the hold gesture). For non-drivers in party,
    // fall back to a plain IconButton — the navigation happens in
    // `fireAdvance` via history.pushState. Drivers still get the linked
    // version below.
    if (requiresHold) {
      return <NextButton ariaLabel={ariaLabel} {...handlers} />;
    }
    return (
      <LocaleLink href={climbUrl} prefetch={false} onClick={handlers.onClick}>
        <NextButton ariaLabel={ariaLabel} />
      </LocaleLink>
    );
  }
  return <NextButton ariaLabel={ariaLabel} {...handlers} disabled={!nextClimb || viewOnlyMode} />;
}
