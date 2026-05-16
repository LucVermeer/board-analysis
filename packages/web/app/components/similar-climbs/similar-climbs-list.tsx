'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import LocationOnOutlined from '@mui/icons-material/LocationOnOutlined';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import type { SimilarClimb } from '@boardsesh/shared-schema';
import AscentThumbnail from '@/app/components/activity-feed/ascent-thumbnail';
import LocaleLink from '@/app/components/i18n/locale-link';
import { createGraphQLHttpClient } from '@/app/lib/graphql/client';
import { getBoardDetailsForBoard } from '@/app/lib/board-utils';
import { getDefaultBoardConfig, getDefaultClimbViewPath } from '@/app/lib/default-board-configs';
import {
  SIMILAR_CLIMBS_QUERY,
  type SimilarClimbsResponse,
  type SimilarClimbsVariables,
} from '@/app/lib/graphql/operations/new-climb-feed';
import type { BoardName } from '@/app/lib/types';
import { constructClimbViewUrlWithSlugs } from '@/app/lib/url-utils';

type SimilarClimbsListProps = {
  boardType: BoardName;
  layoutId: number;
  threshold?: number;
  limit?: number;
  emptyMessage?: string;
  /** When true, the underlying query is run. Defaults to true; the playview
   *  drawer wires this to the collapsible-section's lazy/open state. */
  enabled?: boolean;
} & ({ climbUuid: string; frames?: never } | { climbUuid?: never; frames: string });

export default function SimilarClimbsList({
  boardType,
  layoutId,
  threshold = 0.9,
  limit = 10,
  emptyMessage,
  enabled = true,
  climbUuid,
  frames,
}: SimilarClimbsListProps) {
  const variables = useMemo<SimilarClimbsVariables>(
    () => ({
      input: {
        boardType,
        layoutId,
        threshold,
        limit,
        ...(climbUuid ? { climbUuid } : { frames }),
      },
    }),
    [boardType, layoutId, threshold, limit, climbUuid, frames],
  );

  const queryKey = useMemo(
    () => ['similarClimbs', boardType, layoutId, threshold, limit, climbUuid ?? '', frames ?? ''],
    [boardType, layoutId, threshold, limit, climbUuid, frames],
  );

  const { data, isLoading, isError } = useQuery<SimilarClimb[]>({
    queryKey,
    queryFn: async () => {
      const client = createGraphQLHttpClient();
      const response = await client.request<SimilarClimbsResponse, SimilarClimbsVariables>(
        SIMILAR_CLIMBS_QUERY,
        variables,
      );
      return response.similarClimbs;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  if (!enabled) return null;

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (isError) {
    return (
      <Typography variant="body2" color="error" sx={{ py: 2 }}>
        Couldn&apos;t load similar climbs.
      </Typography>
    );
  }

  const climbs = data ?? [];
  if (climbs.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
        {emptyMessage ?? 'No similar climbs yet.'}
      </Typography>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {climbs.map((climb) => (
        <SimilarClimbRow key={climb.uuid} climb={climb} boardType={boardType} />
      ))}
    </Box>
  );
}

type SimilarClimbRowProps = {
  climb: SimilarClimb;
  boardType: BoardName;
};

function SimilarClimbRow({ climb, boardType }: SimilarClimbRowProps) {
  const angle = climb.angle ?? 0;
  const climbViewPath = useMemo(() => {
    const defaultConfig = getDefaultBoardConfig(boardType, climb.layoutId);
    if (defaultConfig) {
      const details = getBoardDetailsForBoard({
        board_name: boardType,
        layout_id: climb.layoutId,
        size_id: defaultConfig.sizeId,
        set_ids: defaultConfig.setIds,
      });
      if (details?.layout_name && details.size_name && details.set_names) {
        return constructClimbViewUrlWithSlugs(
          boardType,
          details.layout_name,
          details.size_name,
          details.size_description,
          details.set_names,
          angle,
          climb.uuid,
          climb.name || undefined,
        );
      }
    }
    return getDefaultClimbViewPath(boardType, climb.layoutId, angle, climb.uuid, climb.name || undefined);
  }, [boardType, climb.layoutId, angle, climb.uuid, climb.name]);

  const similarityPct = Math.round((climb.similarity ?? 0) * 100);

  return (
    <Card variant="outlined">
      <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
        <LocaleLink href={climbViewPath ?? '#'} style={{ textDecoration: 'none', color: 'inherit' }}>
          <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
            {climb.frames ? (
              <AscentThumbnail
                boardType={boardType}
                layoutId={climb.layoutId}
                angle={angle}
                climbUuid={climb.uuid}
                climbName={climb.name || ''}
                frames={climb.frames}
                isMirror={false}
              />
            ) : null}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" fontWeight={700} noWrap>
                {climb.name || 'Untitled climb'}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
                <PersonOutlined sx={{ fontSize: 14 }} />
                <Typography variant="caption" noWrap>
                  {climb.setterUsername || 'Unknown setter'}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                <Chip
                  label={`${similarityPct}% match`}
                  size="small"
                  color={similarityPct === 100 ? 'error' : 'primary'}
                  variant={similarityPct === 100 ? 'filled' : 'outlined'}
                />
                {climb.angle != null && <Chip icon={<LocationOnOutlined />} label={`${climb.angle}°`} size="small" />}
                <Typography variant="caption" color="text.secondary">
                  {climb.sharedHoldCount}/{climb.candidateHoldCount} holds
                </Typography>
              </Box>
            </Box>
          </Box>
        </LocaleLink>
      </CardContent>
    </Card>
  );
}
