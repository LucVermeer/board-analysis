'use client';

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import MuiAvatar from '@mui/material/Avatar';
import MuiButton from '@mui/material/Button';
import AvatarGroup from '@mui/material/AvatarGroup';
import Lightbulb from '@mui/icons-material/Lightbulb';
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined';
import type { SessionUser } from '@boardsesh/shared-schema';
import { themeTokens } from '@/app/theme/theme-config';
import { TickBadgeAvatar } from '@/app/components/session/tick-badge-avatar';
import type { ClimbQueueItem } from '../queue-control/types';

export type MiniSessionBarProps = {
  /** Local user is the wall driver (their swipes light up the wall). */
  isDriver: boolean;
  /** Active party session with > 1 participant. Solo / no-session → bar hides. */
  isPersistentSessionActive: boolean;
  /** Full session-user list. The bar excludes the local user and floats the
   *  driver to position 0 internally. */
  sessionUsers: SessionUser[];
  /** Local user's session participantId; used to exclude self from the
   *  audience. */
  participantId: string | null;
  /** Session participantId of the current driver, or null if no one holds the
   *  wall yet. */
  driverParticipantId: string | null;
  /** The wall climb (what the driver has lit). The bar morphs to a "back to
   *  wall climb" button when the drawer is showing something else. */
  currentClimbQueueItem: ClimbQueueItem | null;
  /** What the drawer is locally displaying. When non-null and ≠ wall climb,
   *  a non-driver is in the drifted (preview) state. */
  drawerDisplayedItem: ClimbQueueItem | null;
  /** Called when the non-driver taps the back-button morph to snap the
   *  drawer back to the wall climb. */
  onReturnToWallClimb: () => void;
};

/**
 * Mini session bar that sits between the board renderer and the action bar
 * inside the play-view drawer. Single slot that morphs by role + drift state:
 *
 *  - **Non-driver on wall**: avatar + "ON WALL · {driver}"; audience AvatarGroup right.
 *  - **Non-driver drifted**: back-arrow + avatar + "{driver} · {wall climb}" button;
 *    tapping it clears `drawerDisplayedItem` so the drawer snaps back to the wall.
 *  - **Driver**: lit lightbulb + "DRIVING"; audience AvatarGroup right.
 *  - **Solo / no party**: returns null.
 *
 * The bar morphs in place so the climb header above it never reflows on role
 * handoff. Extracted from `play-view-drawer.tsx` so the behavior is testable
 * without the full drawer dependency tree.
 */
export function MiniSessionBar({
  isDriver,
  isPersistentSessionActive,
  sessionUsers,
  participantId,
  driverParticipantId,
  currentClimbQueueItem,
  drawerDisplayedItem,
  onReturnToWallClimb,
}: MiniSessionBarProps) {
  const { t } = useTranslation('session');

  const driverUser = useMemo(() => {
    if (!driverParticipantId) return null;
    return sessionUsers.find((u) => u.id === driverParticipantId) ?? null;
  }, [sessionUsers, driverParticipantId]);

  const wallClimb = currentClimbQueueItem?.climb ?? null;

  const driftedFromWall =
    !isDriver &&
    isPersistentSessionActive &&
    drawerDisplayedItem != null &&
    currentClimbQueueItem != null &&
    drawerDisplayedItem.climb.uuid !== currentClimbQueueItem.climb.uuid;

  // Tick badges reflect "who has done THIS climb" — the climb the drawer is
  // currently displaying, not necessarily the wall climb. For a non-driver
  // browsing in preview mode that's `drawerDisplayedItem`; otherwise the
  // wall climb (drawerDisplayedItem is null and the drawer falls through).
  const effectiveItem = drawerDisplayedItem ?? currentClimbQueueItem;
  const tickedBySet = useMemo(() => new Set(effectiveItem?.tickedBy ?? []), [effectiveItem]);

  const audienceUsers = useMemo(() => {
    if (!isPersistentSessionActive) return [];
    const others = sessionUsers.filter((u) => u.id !== participantId);
    if (!driverParticipantId) return others;
    const driverIdx = others.findIndex((u) => u.id === driverParticipantId);
    if (driverIdx <= 0) return others;
    const reordered = [...others];
    const [driver] = reordered.splice(driverIdx, 1);
    reordered.unshift(driver);
    return reordered;
  }, [isPersistentSessionActive, sessionUsers, participantId, driverParticipantId]);

  if (!isPersistentSessionActive || currentClimbQueueItem == null) return null;

  return (
    <Box
      data-testid="mini-session-bar"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 2,
        py: 0.75,
        borderTop: '1px solid var(--neutral-200)',
        // Warm whisper tint — the IA + iOS-HIG designers' pick. Gives the
        // band a reason to exist visually without painting it like an alert.
        // ~5% theme warning so it sits between the neutral climb area above
        // and the neutral action bar below.
        backgroundColor: `color-mix(in srgb, ${themeTokens.colors.warning} 5%, transparent)`,
        minHeight: 36,
      }}
    >
      {isDriver ? (
        <>
          <Lightbulb sx={{ fontSize: 16, color: themeTokens.colors.warning }} aria-hidden="true" />
          <Box
            component="span"
            sx={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, color: themeTokens.colors.warning }}
          >
            {t('playView.drivingChip')}
          </Box>
        </>
      ) : driftedFromWall && wallClimb ? (
        <MuiButton
          data-testid="mini-session-bar-back"
          onClick={onReturnToWallClimb}
          aria-label={
            driverUser
              ? t('queueBar.ariaLabels.returnToWallClimb', { username: driverUser.username })
              : t('queueBar.ariaLabels.returnToWallClimbNoDriver')
          }
          size="small"
          variant="text"
          disableElevation
          startIcon={<ArrowBackOutlined sx={{ fontSize: 16, color: 'text.secondary' }} />}
          sx={{
            flex: 1,
            minWidth: 0,
            justifyContent: 'flex-start',
            // Match the "ON WALL · {driver}" text style on the other side of
            // the morph so the bar's typography stays consistent across drift
            // states — same fontSize/weight/letterSpacing/color, just a label
            // that names the wall climb instead of the on-wall status.
            textTransform: 'none',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.5,
            color: 'text.secondary',
            py: 0,
            px: 0.5,
            gap: 0.5,
            '& .MuiButton-startIcon': { mr: 0.5 },
          }}
        >
          {driverUser && (
            <MuiAvatar
              alt={driverUser.username}
              src={driverUser.avatarUrl ?? undefined}
              sx={{ width: 20, height: 20, mr: 0.75 }}
            />
          )}
          <Box
            component="span"
            sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
          >
            {driverUser
              ? t('playView.returnToWallPill', {
                  username: driverUser.username,
                  climbName: wallClimb.name,
                })
              : wallClimb.name}
          </Box>
        </MuiButton>
      ) : (
        <>
          {driverUser && (
            <MuiAvatar
              alt={driverUser.username}
              src={driverUser.avatarUrl ?? undefined}
              sx={{ width: 20, height: 20 }}
            />
          )}
          <Box
            component="span"
            sx={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.5,
              color: 'text.secondary',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {driverUser
              ? t('playView.onWallChip', { username: driverUser.username })
              : t('playView.onWallChipNoDriver')}
          </Box>
        </>
      )}
      {audienceUsers.length > 0 && (
        <Box
          data-testid="mini-session-bar-audience"
          sx={{ ml: 'auto', flexShrink: 0 }}
          aria-label={t('playView.audienceCount', { count: audienceUsers.length })}
        >
          <AvatarGroup
            max={3}
            sx={{
              '& .MuiAvatar-root': {
                width: 22,
                height: 22,
                fontSize: 10,
                border: '2px solid transparent',
              },
            }}
          >
            {audienceUsers.map((user) => (
              <TickBadgeAvatar
                key={user.id}
                user={user}
                hasTicked={tickedBySet.has(user.id) || (user.userId != null && tickedBySet.has(user.userId))}
                isDriver={driverParticipantId != null && user.id === driverParticipantId}
                size={22}
              />
            ))}
          </AvatarGroup>
        </Box>
      )}
    </Box>
  );
}
