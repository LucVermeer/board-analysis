'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Box from '@mui/material/Box';
import MuiTypography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import LocationOnOutlined from '@mui/icons-material/LocationOnOutlined';
import PeopleOutlined from '@mui/icons-material/PeopleOutlined';
import TrendingUpOutlined from '@mui/icons-material/TrendingUpOutlined';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import type { UserBoard } from '@boardsesh/shared-schema';
import { boardTypeLabel } from '@boardsesh/board-constants';
import { themeTokens } from '@/app/theme/theme-config';
import StatItem from '@/app/components/ui/stat-item';

type BoardCardProps = {
  board: UserBoard;
  onClick?: (board: UserBoard) => void;
  /** Optional trailing action (e.g. follow button) rendered below the stats row. */
  trailingAction?: React.ReactNode;
};

export default function BoardCard({ board, onClick, trailingAction }: BoardCardProps) {
  const { t } = useTranslation('boards');
  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: `${themeTokens.borderRadius.lg}px`,
        borderColor: 'var(--neutral-200)',
        '&:hover': { borderColor: 'var(--neutral-300)' },
        transition: themeTokens.transitions.fast,
      }}
    >
      <CardActionArea onClick={() => onClick?.(board)} disabled={!onClick}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 1,
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <MuiTypography
                variant="subtitle1"
                sx={{
                  fontWeight: themeTokens.typography.fontWeight.semibold,
                  lineHeight: themeTokens.typography.lineHeight.tight,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {board.name}
              </MuiTypography>
              {board.locationName && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                  <LocationOnOutlined sx={{ fontSize: 14, color: 'var(--neutral-400)' }} />
                  <MuiTypography
                    variant="body2"
                    color="text.secondary"
                    sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {board.locationName}
                  </MuiTypography>
                </Box>
              )}
            </Box>
            <Chip
              label={boardTypeLabel(board.boardType)}
              size="small"
              variant="outlined"
              sx={{
                fontSize: themeTokens.typography.fontSize.xs,
                height: 24,
                flexShrink: 0,
              }}
            />
          </Box>

          <Box sx={{ display: 'flex', gap: 2, mt: 1.5, flexWrap: 'wrap' }}>
            <StatItem
              icon={<TrendingUpOutlined sx={{ fontSize: 14 }} />}
              value={board.totalAscents}
              label={t('boardEntity.stats.ascents')}
            />
            <StatItem
              icon={<PersonOutlined sx={{ fontSize: 14 }} />}
              value={board.uniqueClimbers}
              label={t('boardEntity.stats.climbers')}
            />
            <StatItem
              icon={<PeopleOutlined sx={{ fontSize: 14 }} />}
              value={board.followerCount}
              label={t('boardEntity.stats.followers')}
            />
          </Box>
        </CardContent>
      </CardActionArea>
      {trailingAction && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 2, pb: 1.5 }} onClick={(e) => e.stopPropagation()}>
          {trailingAction}
        </Box>
      )}
    </Card>
  );
}
