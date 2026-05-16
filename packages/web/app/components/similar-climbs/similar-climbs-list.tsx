'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import LocationOnOutlined from '@mui/icons-material/LocationOnOutlined';
import MoreVertOutlined from '@mui/icons-material/MoreVertOutlined';
import type { SimilarClimb } from '@boardsesh/shared-schema';
import BoardImageLayers from '@/app/components/board-renderer/board-image-layers';
import BoardCanvasRenderer from '@/app/components/board-renderer/board-canvas-renderer';
import { useCanvasRendererReady } from '@/app/lib/board-render-worker/worker-manager';
import { ClimbActions } from '@/app/components/climb-actions';
import { useOptionalQueueActions } from '@/app/components/graphql-queue';
import LocaleLink from '@/app/components/i18n/locale-link';
import SwipeableDrawer from '@/app/components/swipeable-drawer/swipeable-drawer';
import { createGraphQLHttpClient } from '@/app/lib/graphql/client';
import { formatCount, formatSends } from '@/app/lib/format-climb-stats';
import { getBoardDetailsForBoard } from '@/app/lib/board-utils';
import { getDefaultBoardConfig, getDefaultClimbViewPath } from '@/app/lib/default-board-configs';
import {
  SIMILAR_CLIMBS_QUERY,
  type SimilarClimbsResponse,
  type SimilarClimbsVariables,
} from '@/app/lib/graphql/operations/new-climb-feed';
import type { BoardDetails, BoardName, Climb } from '@/app/lib/types';
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

  // Pulls in the queue context's setCurrentClimb. Optional because the
  // duplicate-resolution drawer mounts this component before a queue session
  // exists; in that case we fall back to a plain link click.
  const queueActions = useOptionalQueueActions();

  // Single drawer for all cards — track which climb's actions are open.
  // Avoids mounting N drawers up front and keeps the ClimbActions tree warm
  // only while the user is actually interacting with one.
  const [actionsClimb, setActionsClimb] = useState<SimilarClimb | null>(null);
  const closeActions = useCallback(() => setActionsClimb(null), []);

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
    <>
      <div className={styles.scroller}>
        {climbs.map((climb) => (
          <SimilarClimbCard
            key={climb.uuid}
            climb={climb}
            boardType={boardType}
            onSetActive={queueActions ? (c) => queueActions.setCurrentClimb(c) : null}
            onOpenActions={() => setActionsClimb(climb)}
          />
        ))}
      </div>
      {actionsClimb ? (
        <SimilarClimbActionsDrawer climb={actionsClimb} boardType={boardType} onClose={closeActions} />
      ) : null}
    </>
  );
}

type SimilarClimbCardProps = {
  climb: SimilarClimb;
  boardType: BoardName;
  /** When set, card tap activates the climb in the queue instead of navigating. */
  onSetActive: ((climb: Climb) => Promise<unknown>) | null;
  onOpenActions: () => void;
};

function SimilarClimbCard({ climb, boardType, onSetActive, onOpenActions }: SimilarClimbCardProps) {
  const { t } = useTranslation('climbs');
  const canvasReady = useCanvasRendererReady();
  const angle = climb.angle ?? 0;

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

  // Fallback link path for when the queue isn't available — preserves the
  // original navigation behaviour for the duplicate-resolution drawer.
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
    <div className={styles.boardSquare} />
  );

  const handleEllipsisClick = useCallback(
    (event: React.MouseEvent) => {
      // Stop the card's onClick from also firing — opening the actions menu
      // should not also activate the climb.
      event.preventDefault();
      event.stopPropagation();
      onOpenActions();
    },
    [onOpenActions],
  );

  const handleCardClick = useCallback(() => {
    if (!onSetActive) return;
    void onSetActive(buildClimbStub(climb, boardType));
  }, [onSetActive, climb, boardType]);

  const body = (
    <>
      <Box sx={{ position: 'relative' }}>
        {thumbnail}
        <IconButton
          size="small"
          onClick={handleEllipsisClick}
          aria-label={t('similarClimbs.openActions')}
          sx={{
            position: 'absolute',
            top: 4,
            right: 4,
            backgroundColor: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(4px)',
            '&:hover': { backgroundColor: 'rgba(255,255,255,1)' },
          }}
        >
          <MoreVertOutlined fontSize="small" />
        </IconButton>
      </Box>
      <div className={styles.name} title={climb.name || undefined}>
        {climb.name || t('similarClimbs.untitledClimb')}
      </div>
      <div className={styles.byline}>{formatByline(climb)}</div>
      <div className={styles.meta}>
        <Chip
          label={t('similarClimbs.matchPercent', { percent: similarityPct })}
          size="small"
          color={similarityPct === 100 ? 'error' : 'primary'}
          variant={similarityPct === 100 ? 'filled' : 'outlined'}
        />
        {climb.difficultyName ? <Chip label={climb.difficultyName} size="small" color="default" /> : null}
        {climb.angle != null && <Chip icon={<LocationOnOutlined />} label={`${climb.angle}°`} size="small" />}
      </div>
    </>
  );

  // When the queue is available, the card is a button that activates the
  // climb in the play drawer (same drawer the user already has open). When
  // it isn't, fall back to navigating to the climb-view page so the user
  // can still inspect it from contexts outside a session (e.g. the
  // duplicate-resolution drawer in create-climb-form).
  if (onSetActive) {
    return (
      <button type="button" onClick={handleCardClick} className={`${styles.card} ${styles.cardButton}`}>
        {body}
      </button>
    );
  }

  if (climbViewPath) {
    return (
      <LocaleLink href={climbViewPath} className={styles.card}>
        {body}
      </LocaleLink>
    );
  }

  return <div className={`${styles.card} ${styles.cardDisabled}`}>{body}</div>;
}

type SimilarClimbActionsDrawerProps = {
  climb: SimilarClimb;
  boardType: BoardName;
  onClose: () => void;
};

function SimilarClimbActionsDrawer({ climb, boardType, onClose }: SimilarClimbActionsDrawerProps) {
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

  // No boardDetails means we can't compute URLs for the actions either,
  // so the drawer would be useless. Close immediately.
  if (!boardDetails) {
    onClose();
    return null;
  }

  const stub = buildClimbStub(climb, boardType);

  return (
    <SwipeableDrawer title={stub.name || ''} placement="bottom" open onClose={onClose} swipeEnabled={false}>
      <Box sx={{ p: 2 }}>
        <ClimbActions
          climb={stub}
          boardDetails={boardDetails}
          angle={stub.angle}
          viewMode="list"
          onActionComplete={onClose}
        />
      </Box>
    </SwipeableDrawer>
  );
}

/**
 * Compose the "setter · ★N · Y sends" byline shown under the climb name.
 * Skips any segment that's missing data — most user-created climbs have no
 * quality rating or ascent count yet, so we don't want to show stale zeros.
 */
function formatByline(climb: SimilarClimb): string {
  const parts: string[] = [];
  if (climb.setterUsername) parts.push(climb.setterUsername);
  if (typeof climb.qualityAverage === 'number' && climb.qualityAverage > 0) {
    parts.push(`★${climb.qualityAverage.toFixed(1)}`);
  }
  if (typeof climb.ascensionistCount === 'number' && climb.ascensionistCount > 0) {
    parts.push(formatSends(climb.ascensionistCount));
  } else if (typeof climb.ascensionistCount === 'number') {
    parts.push(`${formatCount(0)} sends`);
  }
  return parts.join(' · ');
}

/**
 * Build a `Climb` from a `SimilarClimb` for downstream consumers
 * (`setCurrentClimb`, `ClimbActions`) that expect the full type. Stats fields
 * the similar-climbs query doesn't include get safe defaults; the queue and
 * drawer re-fetch the canonical row from board search by uuid on activation.
 */
function buildClimbStub(similar: SimilarClimb, boardType: BoardName): Climb {
  return {
    uuid: similar.uuid,
    layoutId: similar.layoutId,
    boardType,
    name: similar.name ?? '',
    setter_username: similar.setterUsername ?? '',
    frames: similar.frames ?? '',
    angle: similar.angle ?? 0,
    description: '',
    ascensionist_count: similar.ascensionistCount ?? 0,
    difficulty: similar.difficultyName ?? '',
    quality_average: similar.qualityAverage == null ? '' : similar.qualityAverage.toFixed(2),
    stars: 0,
    difficulty_error: '',
    benchmark_difficulty: null,
  };
}
