'use client';

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Chip from '@mui/material/Chip';
import TrendingUpOutlined from '@mui/icons-material/TrendingUpOutlined';
import TrendingDownOutlined from '@mui/icons-material/TrendingDownOutlined';
import TrendingFlatOutlined from '@mui/icons-material/TrendingFlatOutlined';
import BarChartOutlined from '@mui/icons-material/BarChartOutlined';
import {
  GET_GYM_STATS,
  type GetGymStatsQueryResponse,
  type GetGymStatsQueryVariables,
} from '@boardsesh/graphql/operations';
import type { GymStats } from '@boardsesh/shared-schema';
import { boardTypeLabel } from '@boardsesh/board-constants';
import { useWsAuthToken } from '@/app/hooks/use-ws-auth-token';
import { createGraphQLHttpClient } from '@/app/lib/graphql/client';
import { CssBarChart, type CssBarChartBar } from '@/app/components/charts/css-bar-chart';
import { EmptyState } from '@/app/components/ui/empty-state';
import { themeTokens } from '@/app/theme/theme-config';
import type { GymManageTabProps } from './tab-props';

// Display weekdays Monday-first; Postgres EXTRACT(DOW) is 0 = Sunday … 6 = Saturday.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

// 2024-01-07 is a Sunday, so +dow lands on the matching weekday. Labels come from
// Intl so they follow the viewer's locale without seven hand-kept i18n keys.
function weekdayLabel(dayOfWeek: number, locale: string, style: 'short' | 'long'): string {
  const date = new Date(Date.UTC(2024, 0, 7 + dayOfWeek));
  return new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' }).format(date);
}

export type WowDelta = {
  diff: number;
  direction: 'up' | 'down' | 'flat';
};

/** Week-over-week change of a scalar count. Pure so the delta logic is testable. */
export function computeWowDelta(current: number, previous: number): WowDelta {
  const diff = current - previous;
  if (diff > 0) return { diff, direction: 'up' };
  if (diff < 0) return { diff, direction: 'down' };
  return { diff: 0, direction: 'flat' };
}

/** The weekday with the most ascents (Postgres DOW), or null when the window is empty. */
export function busiestDayOfWeek(busiestDays: GymStats['busiestDays']): number | null {
  let best: { dayOfWeek: number; ascentCount: number } | null = null;
  for (const day of busiestDays) {
    if (!best || day.ascentCount > best.ascentCount) best = day;
  }
  return best ? best.dayOfWeek : null;
}

function DeltaLabel({ delta, testId }: { delta: WowDelta; testId: string }) {
  const { t } = useTranslation('kiosk');
  const iconSx = { fontSize: 16 };
  let color: string;
  let icon: React.ReactNode;
  let label: string;
  if (delta.direction === 'up') {
    color = themeTokens.colors.success;
    icon = <TrendingUpOutlined sx={iconSx} />;
    label = t('manage.insights.deltaUp', { count: delta.diff });
  } else if (delta.direction === 'down') {
    color = themeTokens.colors.error;
    icon = <TrendingDownOutlined sx={iconSx} />;
    label = t('manage.insights.deltaDown', { count: Math.abs(delta.diff) });
  } else {
    color = themeTokens.neutral[500];
    icon = <TrendingFlatOutlined sx={iconSx} />;
    label = t('manage.insights.deltaFlat');
  }
  return (
    <Box data-testid={testId} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color }}>
      {icon}
      <Typography variant="caption" sx={{ color: 'inherit', fontWeight: themeTokens.typography.fontWeight.semibold }}>
        {label}
      </Typography>
    </Box>
  );
}

function StatCard({
  value,
  label,
  delta,
  deltaTestId,
}: {
  value: React.ReactNode;
  label: string;
  delta?: WowDelta;
  deltaTestId?: string;
}) {
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        borderRadius: `${themeTokens.borderRadius.md}px`,
        bgcolor: 'var(--neutral-100)',
        p: 1.5,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0.5,
        textAlign: 'center',
      }}
    >
      <Typography
        variant="h5"
        component="span"
        sx={{ fontWeight: themeTokens.typography.fontWeight.bold, lineHeight: 1 }}
      >
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
        {label}
      </Typography>
      {delta && deltaTestId && <DeltaLabel delta={delta} testId={deltaTestId} />}
    </Box>
  );
}

function InsightsSkeleton() {
  return (
    <Box data-testid="insights-loading">
      <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
        {[0, 1, 2].map((index) => (
          <Skeleton
            key={index}
            variant="rounded"
            height={96}
            sx={{ flex: 1, borderRadius: `${themeTokens.borderRadius.md}px` }}
          />
        ))}
      </Box>
      <Skeleton variant="text" width={160} sx={{ mb: 1 }} />
      {[0, 1, 2, 3, 4].map((index) => (
        <Skeleton key={index} variant="text" height={32} />
      ))}
      <Skeleton variant="rounded" height={160} sx={{ mt: 3, borderRadius: `${themeTokens.borderRadius.md}px` }} />
    </Box>
  );
}

export default function InsightsTab({ gym }: GymManageTabProps) {
  const { t, i18n } = useTranslation('kiosk');
  const { token, isLoading: isTokenLoading } = useWsAuthToken();
  const { data: session } = useSession();
  // Editor-scoped read: key on viewer so an in-session login/logout doesn't
  // serve the previous viewer's cache entry.
  const viewerUserId = session?.user?.id ?? 'anonymous';
  const locale = i18n.language || 'en-US';

  const {
    data: stats,
    isPending,
    isError,
  } = useQuery({
    queryKey: ['gymStats', gym.uuid, viewerUserId],
    queryFn: async () => {
      const client = createGraphQLHttpClient(token);
      const response = await client.request<GetGymStatsQueryResponse, GetGymStatsQueryVariables>(GET_GYM_STATS, {
        input: { gymUuid: gym.uuid, period: 'week' },
      });
      return response.gymStats;
    },
    enabled: !!token,
  });

  const dayBars = useMemo<CssBarChartBar[]>(() => {
    if (!stats) return [];
    const countByDow = new Map(stats.busiestDays.map((day) => [day.dayOfWeek, day.ascentCount]));
    return WEEK_ORDER.map((dow) => ({
      key: String(dow),
      label: weekdayLabel(dow, locale, 'short'),
      segments: [
        { value: countByDow.get(dow) ?? 0, color: themeTokens.colors.primary, label: t('manage.insights.ascents') },
      ],
    }));
  }, [stats, locale, t]);

  if (isTokenLoading || isPending) {
    return <InsightsSkeleton />;
  }

  if (isError || !stats) {
    return <EmptyState description={t('manage.insights.loadError')} />;
  }

  const uniqueDelta = computeWowDelta(stats.current.uniqueClimbers, stats.previous.uniqueClimbers);
  const ascentDelta = computeWowDelta(stats.current.ascentCount, stats.previous.ascentCount);
  const busiestDow = busiestDayOfWeek(stats.busiestDays);

  if (stats.current.ascentCount === 0) {
    return (
      <EmptyState
        icon={<BarChartOutlined fontSize="inherit" />}
        description={
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h6" sx={{ fontWeight: themeTokens.typography.fontWeight.bold, mb: 0.5 }}>
              {t('manage.insights.empty.title')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('manage.insights.empty.body')}
            </Typography>
          </Box>
        }
      />
    );
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('manage.insights.subtitle')}
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
        <StatCard
          value={stats.current.uniqueClimbers}
          label={t('manage.insights.uniqueClimbers')}
          delta={uniqueDelta}
          deltaTestId="insights-delta-climbers"
        />
        <StatCard
          value={stats.current.ascentCount}
          label={t('manage.insights.ascents')}
          delta={ascentDelta}
          deltaTestId="insights-delta-ascents"
        />
        <StatCard
          value={busiestDow === null ? '—' : weekdayLabel(busiestDow, locale, 'short')}
          label={t('manage.insights.busiestDay')}
        />
      </Box>

      <Typography variant="subtitle2" sx={{ fontWeight: themeTokens.typography.fontWeight.semibold, mb: 1 }}>
        {t('manage.insights.byDay')}
      </Typography>
      <CssBarChart
        bars={dayBars}
        height={160}
        mobileHeight={120}
        showLegend={false}
        ariaLabel={t('manage.insights.byDayAria')}
      />

      <Typography variant="subtitle2" sx={{ fontWeight: themeTokens.typography.fontWeight.semibold, mt: 3, mb: 1 }}>
        {t('manage.insights.topClimbs')}
      </Typography>
      {stats.topClimbs.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t('manage.insights.noTopClimbs')}
        </Typography>
      ) : (
        <List disablePadding data-testid="insights-top-climbs">
          {stats.topClimbs.map((climb, index) => (
            <ListItem
              key={`${climb.climbUuid}-${climb.angle}`}
              disableGutters
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                py: 0.75,
                borderBottom: index < stats.topClimbs.length - 1 ? `1px solid var(--neutral-200)` : 'none',
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  width: 24,
                  color: 'text.secondary',
                  fontWeight: themeTokens.typography.fontWeight.semibold,
                  flexShrink: 0,
                }}
              >
                {index + 1}
              </Typography>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: themeTokens.typography.fontWeight.medium,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {climb.name ?? t('manage.insights.unnamedClimb')}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {boardTypeLabel(climb.boardType)}
                  {climb.gradeName ? ` · ${climb.gradeName}` : ''}
                  {` · ${climb.angle}°`}
                </Typography>
              </Box>
              <Chip
                size="small"
                variant="outlined"
                label={t('manage.insights.ascentsCount', { count: climb.ascentCount })}
                sx={{ flexShrink: 0 }}
              />
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
}
