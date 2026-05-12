'use client';

import React, { useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { themeTokens } from '@/app/theme/theme-config';
import { createGraphQLHttpClient } from '@/app/lib/graphql/client';
import { GET_USER_BETA_LINKS } from '@/app/lib/graphql/operations/beta-links';
import { mapBetaLinkRow } from '@/app/lib/beta-video-url';
import type { BetaLink } from '@/app/lib/api-wrappers/sync-api-types';
import type { RecentBetaLinkRow } from '@/app/lib/server-recent-beta-links';
import BoardseshBetaList from '@/app/components/beta-videos/boardsesh-beta-list';

type ProfileBetaSectionProps = {
  userId: string;
  initialBeta: RecentBetaLinkRow[];
};

const USER_BETA_LIMIT = 50;
const USER_BETA_STALE_TIME_MS = 5 * 60 * 1000;

type UserBetaResponse = {
  userBetaLinks: RecentBetaLinkRow[];
};

export default function ProfileBetaSection({ userId, initialBeta }: ProfileBetaSectionProps) {
  const { t } = useTranslation('profile');

  const { data: rows = [] } = useQuery<RecentBetaLinkRow[]>({
    queryKey: ['userBetaLinks', userId],
    queryFn: async () => {
      const client = createGraphQLHttpClient();
      const result = await client.request<UserBetaResponse>(GET_USER_BETA_LINKS, { userId, limit: USER_BETA_LIMIT });
      return result.userBetaLinks;
    },
    initialData: initialBeta,
    staleTime: USER_BETA_STALE_TIME_MS,
  });

  const { links, climbNameByLink } = useMemo(() => {
    const mapped: BetaLink[] = [];
    const nameByLink = new Map<string, string | null>();
    for (const row of rows) {
      const link = mapBetaLinkRow(row.betaLink);
      mapped.push(link);
      nameByLink.set(link.link, row.climbName);
    }
    return { links: mapped, climbNameByLink: nameByLink };
  }, [rows]);

  if (links.length === 0) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%' }}>
      <Typography
        variant="body2"
        fontWeight={themeTokens.typography.fontWeight.semibold}
        sx={{
          color: 'var(--neutral-400)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontSize: themeTokens.typography.fontSize.xs,
          px: 0.5,
        }}
      >
        {t('page.betaVideos')}
      </Typography>
      <BoardseshBetaList
        links={links}
        isLoading={false}
        source="profile"
        getClimbName={(link) => climbNameByLink.get(link.link)}
      />
    </Box>
  );
}
