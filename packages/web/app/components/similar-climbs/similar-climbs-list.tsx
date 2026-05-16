'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import LocationOnOutlined from '@mui/icons-material/LocationOnOutlined';
import type { SimilarClimb } from '@boardsesh/shared-schema';
import BoardImageLayers from '@/app/components/board-renderer/board-image-layers';
import BoardCanvasRenderer from '@/app/components/board-renderer/board-canvas-renderer';
import { useCanvasRendererReady } from '@/app/lib/board-render-worker/worker-manager';
import LocaleLink from '@/app/components/i18n/locale-link';
import { createGraphQLHttpClient } from '@/app/lib/graphql/client';
import { getBoardDetailsForBoard } from '@/app/lib/board-utils';
import { getDefaultBoardConfig, getDefaultClimbViewPath } from '@/app/lib/default-board-configs';
import {
  SIMILAR_CLIMBS_QUERY,
  type SimilarClimbsResponse,
  type SimilarClimbsVariables,
} from '@/app/lib/graphql/operations/new-climb-feed';
import type { BoardDetails, BoardName } from '@/app/lib/types';
import { constructClimbViewUrlWithSlugs } from '@/app/lib/url-utils';
import styles from './similar-climbs-list.module.css';

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
  threshold = 0.5,
  limit = 10,
  emptyMessage,
  enabled = true,
  climbUuid,
  frames,
}: SimilarClimbsListProps) {
  const { t } = useTranslation('climbs');
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
        {t('similarClimbs.loadError')}
      </Typography>
    );
  }

  const climbs = data ?? [];
  if (climbs.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
        {emptyMessage ?? t('similarClimbs.emptyDefault')}
      </Typography>
    );
  }

  return (
    <div className={styles.scroller}>
      {climbs.map((climb) => (
        <SimilarClimbCard key={climb.uuid} climb={climb} boardType={boardType} />
      ))}
    </div>
  );
}

type SimilarClimbCardProps = {
  climb: SimilarClimb;
  boardType: BoardName;
};

function SimilarClimbCard({ climb, boardType }: SimilarClimbCardProps) {
  const { t } = useTranslation('climbs');
  const canvasReady = useCanvasRendererReady();
  const angle = climb.angle ?? 0;

  // Resolve board details from the default config for this layout. This is
  // what BoardRenderer / BoardImageLayers need to draw the wall + holds. When
  // the layout isn't in DEFAULT_CONFIGS (decoy, grasshopper, soill, touchstone
  // and a handful of unhandled Kilter/Tension layouts) boardDetails is null
  // and we render the card without a thumbnail, still linking when possible.
  const boardDetails = useMemo<BoardDetails | null>(() => {
    const config = getDefaultBoardConfig(boardType, climb.layoutId);
    if (!config) return null;
    try {
      return getBoardDetailsForBoard({
        board_name: boardType,
        layout_id: climb.layoutId,
        size_id: config.sizeId,
        set_ids: config.setIds,
      });
    } catch {
      return null;
    }
  }, [boardType, climb.layoutId]);

  const climbViewPath = useMemo(() => {
    if (boardDetails?.layout_name && boardDetails.size_name && boardDetails.set_names) {
      return constructClimbViewUrlWithSlugs(
        boardType,
        boardDetails.layout_name,
        boardDetails.size_name,
        boardDetails.size_description,
        boardDetails.set_names,
        angle,
        climb.uuid,
        climb.name || undefined,
      );
    }
    return getDefaultClimbViewPath(boardType, climb.layoutId, angle, climb.uuid, climb.name || undefined);
  }, [boardType, climb.layoutId, angle, climb.uuid, climb.name, boardDetails]);

  const similarityPct = Math.round((climb.similarity ?? 0) * 100);

  const thumbnail = boardDetails ? (
    <div className={styles.boardSquare}>
      {canvasReady && climb.frames ? (
        <BoardCanvasRenderer
          boardDetails={boardDetails}
          frames={climb.frames}
          mirrored={false}
          thumbnail
          style={{ width: '100%', height: '100%' }}
        />
      ) : (
        <BoardImageLayers
          boardDetails={boardDetails}
          frames={climb.frames ?? undefined}
          mirrored={false}
          thumbnail
          style={{ width: '100%', height: '100%' }}
        />
      )}
    </div>
  ) : (
    // No thumbnail available for this layout — show a neutral placeholder so
    // the card still has the homepage-sized footprint.
    <div className={styles.boardSquare} />
  );

  const body = (
    <>
      {thumbnail}
      <div className={styles.name} title={climb.name || undefined}>
        {climb.name || t('similarClimbs.untitledClimb')}
      </div>
      <div className={styles.meta}>
        <Chip
          label={t('similarClimbs.matchPercent', { percent: similarityPct })}
          size="small"
          color={similarityPct === 100 ? 'error' : 'primary'}
          variant={similarityPct === 100 ? 'filled' : 'outlined'}
        />
        {climb.angle != null && <Chip icon={<LocationOnOutlined />} label={`${climb.angle}°`} size="small" />}
      </div>
    </>
  );

  if (!climbViewPath) {
    return <div className={`${styles.card} ${styles.cardDisabled}`}>{body}</div>;
  }

  return (
    <LocaleLink href={climbViewPath} className={styles.card}>
      {body}
    </LocaleLink>
  );
}
