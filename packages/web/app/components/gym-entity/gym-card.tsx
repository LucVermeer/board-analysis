'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Box from '@mui/material/Box';
import MuiTypography from '@mui/material/Typography';
import MuiLink from '@mui/material/Link';
import LocationOnOutlined from '@mui/icons-material/LocationOnOutlined';
import PeopleOutlined from '@mui/icons-material/PeopleOutlined';
import FitnessCenterOutlined from '@mui/icons-material/FitnessCenterOutlined';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import type { Gym } from '@boardsesh/shared-schema';
import { themeTokens } from '@/app/theme/theme-config';
import StatItem from '@/app/components/ui/stat-item';
import LocaleLink from '@/app/components/i18n/locale-link';

type GymCardProps = {
  gym: Gym;
  onClick?: (gym: Gym) => void;
};

export default function GymCard({ gym, onClick }: GymCardProps) {
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
      {/* Rendered as a div (not the default <button>) so the crawlable gym-name
          <a> can nest inside it without invalid interactive-in-button markup.
          ButtonBase still adds role="button" + keyboard handling for the card
          tap that opens the preview sheet. */}
      <CardActionArea component="div" onClick={() => onClick?.(gym)} disabled={!onClick}>
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
              {gym.slug ? (
                <MuiLink
                  component={LocaleLink}
                  href={`/gym/${gym.slug}`}
                  // Let the name link go to the full gym page without also
                  // opening the card's preview sheet.
                  onClick={(event: React.MouseEvent) => event.stopPropagation()}
                  underline="hover"
                  color="inherit"
                  variant="subtitle1"
                  sx={{
                    display: 'block',
                    fontWeight: themeTokens.typography.fontWeight.semibold,
                    lineHeight: themeTokens.typography.lineHeight.tight,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {gym.name}
                </MuiLink>
              ) : (
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
                  {gym.name}
                </MuiTypography>
              )}
              {gym.address && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                  <LocationOnOutlined sx={{ fontSize: 14, color: 'var(--neutral-400)' }} />
                  <MuiTypography
                    variant="body2"
                    color="text.secondary"
                    sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {gym.address}
                  </MuiTypography>
                </Box>
              )}
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 2, mt: 1.5, flexWrap: 'wrap' }}>
            <StatItem
              icon={<FitnessCenterOutlined sx={{ fontSize: 14 }} />}
              value={gym.boardCount}
              label={t('gymEntity.stats.boards')}
            />
            <StatItem
              icon={<PersonOutlined sx={{ fontSize: 14 }} />}
              value={gym.memberCount}
              label={t('gymEntity.stats.members')}
            />
            <StatItem
              icon={<PeopleOutlined sx={{ fontSize: 14 }} />}
              value={gym.followerCount}
              label={t('gymEntity.stats.followers')}
            />
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
