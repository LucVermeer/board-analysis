'use client';

import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueueActions, useSessionData } from '../graphql-queue';
import type { BoardDetails } from '@/app/lib/types';
import FastForwardOutlined from '@mui/icons-material/FastForwardOutlined';
import FastRewindOutlined from '@mui/icons-material/FastRewindOutlined';
import { track } from '@/app/lib/analytics';
import IconButton from '@mui/material/IconButton';

type Direction = 'next' | 'previous';

type QueueNavButtonProps = {
  direction: Direction;
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
 * active) but never calls `takeControl`. On `/view/` pages the drawer's
 * `useDrawerUrlSync` owns URL state, so this button never touches history.
 */
export default function QueueNavButton({ direction, boardDetails }: QueueNavButtonProps) {
  const { t } = useTranslation('climbs');
  // Statically-resolvable t() calls so the i18n linter can verify both keys.
  const ariaLabel = direction === 'next' ? t('actions.navigation.nextClimb') : t('actions.navigation.previousClimb');
  const Icon = ICON[direction];
  const { setCurrentClimbQueueItem, getNextClimbQueueItem, getPreviousClimbQueueItem } = useQueueActions();
  const { viewOnlyMode, isPersistentSessionActive, isDriver } = useSessionData();

  const target = direction === 'next' ? getNextClimbQueueItem() : getPreviousClimbQueueItem();

  const fireAdvance = useCallback(() => {
    if (!target || viewOnlyMode) return;
    setCurrentClimbQueueItem(target);
    const boardLayout = boardDetails?.layout_name || '';
    track('Queue Navigation', {
      direction,
      method: 'button',
      boardLayout,
    });
    // Pivot Phase 5: Wall Advance fires on every successful broadcast advance.
    // Bar prev/next is always a broadcast (any participant can advance the
    // wall climb) and never transfers the driver — so pressedByRole reflects
    // the presser's current role rather than implying a take-control.
    //
    // Fired BEFORE the mutation acks — matches the existing `Queue Navigation`
    // fire-on-call pattern (above). Means a transient network failure can
    // produce a `Wall Advance` event without a corresponding wall change.
    // Consistent with other queue analytics and intentional: we'd rather
    // count user intent than gate on round-trip success. Watch the ratio of
    // `Wall Advance` to `Wall Confirmed` if this becomes a misleading signal.
    track('Wall Advance', {
      source: 'bar_button',
      pressedByRole: isPersistentSessionActive && !isDriver ? 'non_driver' : 'driver',
      direction,
      mode: isPersistentSessionActive ? 'party' : 'solo',
      boardLayout,
    });
  }, [
    target,
    viewOnlyMode,
    setCurrentClimbQueueItem,
    boardDetails?.layout_name,
    direction,
    isPersistentSessionActive,
    isDriver,
  ]);

  return (
    <IconButton aria-label={ariaLabel} onClick={fireAdvance} disabled={!target || viewOnlyMode}>
      <Icon />
    </IconButton>
  );
}
