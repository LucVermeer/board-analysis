'use client';

import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import LocaleLink from '@/app/components/i18n/locale-link';
import { useQueueActions, useSessionData } from '../graphql-queue';
import { constructPlayUrlWithSlugs, getContextAwareClimbViewUrl } from '@/app/lib/url-utils';
import type { BoardDetails } from '@/app/lib/types';
import { useResolvedBoardDetails } from '@/app/hooks/use-resolved-board-details';
import FastForwardOutlined from '@mui/icons-material/FastForwardOutlined';
import FastRewindOutlined from '@mui/icons-material/FastRewindOutlined';
import { track } from '@/app/lib/analytics';
import IconButton from '@mui/material/IconButton';

type Direction = 'next' | 'previous';

type QueueNavButtonProps = {
  direction: Direction;
  navigate: boolean;
  boardDetails?: BoardDetails;
};

const ICON = { next: FastForwardOutlined, previous: FastRewindOutlined } as const;

/**
 * Bar prev/next-climb button.
 *
 * Queue-control-bar pivot (simplified): any participant — driver or
 * non-driver, solo or party — can tap this and the wall climb advances
 * instantly to the next/previous queue item. There is no hold-to-confirm gate
 * and no driver transfer; the presser stays a non-driver, only the shared
 * queue position moves. `setCurrentClimbQueueItem` updates the queue state
 * (and broadcasts via the persistent-session subscription when party is
 * active) but never calls `takeControl`.
 */
export default function QueueNavButton({ direction, navigate, boardDetails }: QueueNavButtonProps) {
  const { t } = useTranslation('climbs');
  // Statically-resolvable t() calls so the i18n linter can verify both keys.
  const ariaLabel = direction === 'next' ? t('actions.navigation.nextClimb') : t('actions.navigation.previousClimb');
  const Icon = ICON[direction];
  const { setCurrentClimbQueueItem, getNextClimbQueueItem, getPreviousClimbQueueItem } = useQueueActions();
  const { viewOnlyMode } = useSessionData();
  const { rawParams, angle, pathname, searchParams, isPlayPage, resolvedDetails } =
    useResolvedBoardDetails(boardDetails);

  const target = direction === 'next' ? getNextClimbQueueItem() : getPreviousClimbQueueItem();

  const buildClimbUrl = () => {
    if (!target) return '';
    if (!isPlayPage) {
      return getContextAwareClimbViewUrl(pathname, resolvedDetails, angle, target.climb.uuid, target.climb.name);
    }
    const slugUrl =
      resolvedDetails.layout_name && resolvedDetails.size_name && resolvedDetails.set_names
        ? constructPlayUrlWithSlugs(
            resolvedDetails.board_name,
            resolvedDetails.layout_name,
            resolvedDetails.size_name,
            resolvedDetails.size_description,
            resolvedDetails.set_names,
            angle,
            target.climb.uuid,
            target.climb.name,
          )
        : `/${rawParams.board_name}/${rawParams.layout_id}/${rawParams.size_id}/${rawParams.set_ids}/${rawParams.angle}/play/${target.climb.uuid}`;
    const queryString = searchParams.toString();
    return queryString ? `${slugUrl}?${queryString}` : slugUrl;
  };

  const fireAdvance = useCallback(() => {
    if (!target || viewOnlyMode) return;
    setCurrentClimbQueueItem(target);
    track('Queue Navigation', {
      direction,
      method: 'button',
      boardLayout: boardDetails?.layout_name || '',
    });
    if (navigate && isPlayPage) {
      const url = buildClimbUrl();
      if (url) window.history.pushState(null, '', url);
    }
    // buildClimbUrl is a closure over current state; recreating each fire is
    // intentional. target is the only ref-stable input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, navigate, isPlayPage, viewOnlyMode, setCurrentClimbQueueItem, boardDetails?.layout_name, direction]);

  const button = (
    <IconButton aria-label={ariaLabel} onClick={fireAdvance} disabled={!target || viewOnlyMode}>
      <Icon />
    </IconButton>
  );

  if (!viewOnlyMode && navigate && target && !isPlayPage) {
    return (
      <LocaleLink href={buildClimbUrl()} prefetch={false} onClick={fireAdvance}>
        <IconButton aria-label={ariaLabel}>
          <Icon />
        </IconButton>
      </LocaleLink>
    );
  }
  return button;
}
