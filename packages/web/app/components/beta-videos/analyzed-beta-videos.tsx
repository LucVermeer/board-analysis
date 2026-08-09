'use client';

import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NavigateBefore from '@mui/icons-material/NavigateBefore';
import NavigateNext from '@mui/icons-material/NavigateNext';
import OpenInNew from '@mui/icons-material/OpenInNew';
import type { AnalyzedBetaVideo } from '@boardsesh/shared-schema';
import {
  GET_ANALYZED_BETA_NAVIGATION,
  GET_ANALYZED_BETA_VIDEOS,
  type GetAnalyzedBetaNavigationResponse,
  type GetAnalyzedBetaVideosResponse,
} from '@boardsesh/graphql/operations/analyzed-beta-videos';
import { createGraphQLHttpClient } from '@/app/lib/graphql/client';
import { getBackendHttpUrl } from '@/app/lib/backend-url';
import VideoSpeedControl from '@/app/components/attempt-videos/video-speed-control';
import { AnalyzedBetaNavigator } from './analyzed-beta-navigator';

type ClimbingMove = {
  number: number;
  kind: string;
  playback: { start_s: number; end_s: number };
};

function backendUrl(path: string): string {
  return `${getBackendHttpUrl() ?? ''}${path}`;
}

export function AnalyzedBetaPlayer({ beta }: { beta: AnalyzedBetaVideo }) {
  const { t } = useTranslation('climbs');
  const moveSelectLabelId = useId();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [speed, setSpeed] = useState(1);
  const [moveIndex, setMoveIndex] = useState(0);
  const [activeMoveIndex, setActiveMoveIndex] = useState<number | null>(null);
  const { data: moves = [] } = useQuery({
    queryKey: ['analyzedBetaMoves', beta.id, beta.movesPath],
    queryFn: async () => {
      if (!beta.movesPath) return [];
      const response = await fetch(backendUrl(beta.movesPath), { cache: 'no-store' });
      if (!response.ok) throw new Error(`Move analysis returned ${response.status}`);
      const payload = (await response.json()) as { moves?: ClimbingMove[] };
      return payload.moves ?? [];
    },
    enabled: beta.hasMoveAnalysis && !!beta.movesPath,
    staleTime: 5 * 60_000,
  });
  const updateSpeed = (nextSpeed: number) => {
    setSpeed(nextSpeed);
    if (videoRef.current) videoRef.current.playbackRate = nextSpeed;
  };
  const playMove = (nextIndex: number) => {
    const move = moves[nextIndex];
    if (!move || !videoRef.current) return;
    setMoveIndex(nextIndex);
    setActiveMoveIndex(nextIndex);
    videoRef.current.currentTime = move.playback.start_s;
    void videoRef.current.play();
  };

  return (
    <Box sx={{ py: 2, borderBottom: '1px solid', borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
      {!beta.isDefinitive && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          {t('analyzedBeta.possibleMatch')}
        </Alert>
      )}
      <video
        ref={videoRef}
        src={backendUrl(beta.playbackPath)}
        controls
        muted
        playsInline
        preload="metadata"
        aria-label={t('analyzedBeta.videoAria')}
        onTimeUpdate={() => {
          const video = videoRef.current;
          const move = activeMoveIndex == null ? null : moves[activeMoveIndex];
          if (video && move && video.currentTime >= move.playback.end_s) {
            video.pause();
            setActiveMoveIndex(null);
          }
        }}
        style={{ display: 'block', width: '100%', maxHeight: 520, background: '#000', borderRadius: 6 }}
      />
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mt: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2">
            {beta.sourceAccount ? `@${beta.sourceAccount}` : t('analyzedBeta.sourceUnknown')}
          </Typography>
          {beta.mediaItemCount && beta.mediaItemCount > 1 && (
            <Typography variant="caption" color="text.secondary">
              {t('analyzedBeta.carouselItem', { item: beta.mediaItemIndex, count: beta.mediaItemCount })}
            </Typography>
          )}
        </Box>
        {beta.postUrl && (
          <Link
            href={beta.postUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('analyzedBeta.openPostAria')}
          >
            <OpenInNew />
          </Link>
        )}
      </Stack>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap" sx={{ mt: 1 }}>
        <VideoSpeedControl value={speed} onChange={updateSpeed} />
        {beta.hasMoveAnalysis && moves.length > 0 && (
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <IconButton
              onClick={() => playMove(moveIndex - 1)}
              disabled={moveIndex === 0}
              aria-label={t('analyzedBeta.previousMoveAria')}
            >
              <NavigateBefore />
            </IconButton>
            <FormControl size="small" sx={{ minWidth: 116 }}>
              <InputLabel id={moveSelectLabelId}>{t('analyzedBeta.moveLabel')}</InputLabel>
              <Select
                labelId={moveSelectLabelId}
                value={moveIndex}
                label={t('analyzedBeta.moveLabel')}
                onChange={(event) => playMove(Number(event.target.value))}
              >
                {moves.map((move, index) => (
                  <MenuItem key={move.number} value={index}>
                    {t('analyzedBeta.moveCount', { move: index + 1, count: moves.length })}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <IconButton
              onClick={() => playMove(moveIndex + 1)}
              disabled={moveIndex >= moves.length - 1}
              aria-label={t('analyzedBeta.nextMoveAria')}
            >
              <NavigateNext />
            </IconButton>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

export default function AnalyzedBetaVideos({
  boardType,
  climbUuid,
  layoutId,
}: {
  boardType: string;
  climbUuid: string;
  layoutId: number;
}) {
  const { t } = useTranslation('climbs');
  const { data = [], isLoading: videosLoading } = useQuery({
    queryKey: ['analyzedBetaVideos', boardType, climbUuid, layoutId],
    queryFn: async () => {
      const result = await createGraphQLHttpClient().request<GetAnalyzedBetaVideosResponse>(GET_ANALYZED_BETA_VIDEOS, {
        boardType,
        climbUuid,
        layoutId,
      });
      return result.analyzedBetaVideos;
    },
    enabled: boardType === 'moonboard' && layoutId === 3,
    staleTime: 60_000,
  });
  const { data: navigation, isLoading: navigationLoading } = useQuery({
    queryKey: ['analyzedBetaNavigation', boardType, climbUuid, layoutId],
    queryFn: async () => {
      const result = await createGraphQLHttpClient().request<GetAnalyzedBetaNavigationResponse>(
        GET_ANALYZED_BETA_NAVIGATION,
        { boardType, climbUuid, layoutId },
      );
      return result.analyzedBetaNavigation;
    },
    enabled: boardType === 'moonboard' && layoutId === 3,
    staleTime: 60_000,
  });
  if (videosLoading || navigationLoading) {
    return <CircularProgress size={24} aria-label={t('analyzedBeta.loading')} />;
  }
  if (data.length === 0) return null;
  const navigableBetas = data.filter((beta) => beta.isDefinitive && beta.hasMoveAnalysis && beta.movesPath);
  const fallbackBetas = data.filter((beta) => !navigableBetas.includes(beta));
  return (
    <Box>
      {navigation && navigation.confirmedVideoCount > 0 && navigableBetas.length > 0 ? (
        <AnalyzedBetaNavigator
          betas={navigableBetas}
          navigation={navigation}
          boardType={boardType}
          climbUuid={climbUuid}
          layoutId={layoutId}
        />
      ) : (
        navigableBetas.map((beta) => <AnalyzedBetaPlayer key={beta.segmentKey} beta={beta} />)
      )}
      {fallbackBetas.map((beta) => (
        <AnalyzedBetaPlayer key={beta.segmentKey} beta={beta} />
      ))}
    </Box>
  );
}
