'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import Avatar from '@mui/material/Avatar';
import Badge from '@mui/material/Badge';
import CheckOutlined from '@mui/icons-material/CheckOutlined';
import Lightbulb from '@mui/icons-material/Lightbulb';
import { themeTokens } from '@/app/theme/theme-config';

const TICK_BADGE_SX = {
  '& .MuiBadge-badge': {
    backgroundColor: themeTokens.colors.success,
    color: 'common.white',
    width: 16,
    height: 16,
    minWidth: 16,
    borderRadius: '50%',
    border: '2px solid transparent',
  },
} as const;

const DRIVER_BADGE_SX = {
  '& .MuiBadge-badge': {
    ...themeTokens.badge.small,
    backgroundColor: themeTokens.colors.primary,
    color: 'common.white',
    borderRadius: '50%',
    border: '2px solid transparent',
  },
} as const;

export type TickBadgeAvatarProps = {
  user: { id: string; username: string; avatarUrl?: string };
  hasTicked: boolean;
  size?: number;
  /** Overlay a small lit lightbulb badge on the top-right corner of the
   *  avatar so the driver is unambiguous in any AvatarGroup. Composes with
   *  the tick badge (bottom-right) so a driver who has also ticked the
   *  current climb shows both. */
  isDriver?: boolean;
};

/** Avatar with optional tick (bottom-right) and driver (top-right) badges.
 *  Shared between the queue-control bar's session header and the play-view
 *  drawer's mini session bar so the audience treatment is identical across
 *  surfaces. */
export function TickBadgeAvatar({ user, hasTicked, size = 28, isDriver = false }: TickBadgeAvatarProps) {
  const { t } = useTranslation('session');
  const driverAriaLabel = isDriver ? t('queueBar.ariaLabels.userIsDriving', { username: user.username }) : undefined;
  const baseAvatar = (
    <Avatar
      alt={user.username}
      src={user.avatarUrl ?? undefined}
      aria-label={driverAriaLabel}
      sx={size !== 28 ? { width: size, height: size } : undefined}
    />
  );
  const withTick = hasTicked ? (
    <Badge
      overlap="circular"
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      badgeContent={<CheckOutlined sx={{ fontSize: 10 }} />}
      sx={TICK_BADGE_SX}
    >
      {baseAvatar}
    </Badge>
  ) : (
    baseAvatar
  );
  if (!isDriver) return withTick;
  return (
    <Badge
      overlap="circular"
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      badgeContent={<Lightbulb sx={{ fontSize: 10 }} />}
      sx={DRIVER_BADGE_SX}
    >
      {withTick}
    </Badge>
  );
}
