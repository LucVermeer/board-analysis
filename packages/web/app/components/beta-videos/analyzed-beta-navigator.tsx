'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';
import NavigateBefore from '@mui/icons-material/NavigateBefore';
import NavigateNext from '@mui/icons-material/NavigateNext';
import OpenInNew from '@mui/icons-material/OpenInNew';
import type {
  AnalyzedBetaHold,
  AnalyzedBetaMoveAttempt,
  AnalyzedBetaNavigation,
  AnalyzedBetaVideo,
} from '@boardsesh/shared-schema';
import {
  GET_ANALYZED_BETA_MOVE_ATTEMPTS,
  type GetAnalyzedBetaMoveAttemptsResponse,
} from '@boardsesh/graphql/operations/analyzed-beta-videos';
import { createGraphQLHttpClient } from '@/app/lib/graphql/client';
import { getBackendHttpUrl } from '@/app/lib/backend-url';
import VideoSpeedControl from '@/app/components/attempt-videos/video-speed-control';

type ClimbingMoveTransition = {
  hand: string;
  source: AnalyzedBetaHold;
  destination: AnalyzedBetaHold;
  source_assumed?: boolean;
};

export type ClimbingMove = {
  id: string;
  number: number;
  move_key: string;
  playback: { start_s: number; end_s: number };
  transitions: ClimbingMoveTransition[];
  confidence?: number;
  warnings?: string[];
};

type NavigationItem = {
  beta: AnalyzedBetaVideo;
  attempt: AnalyzedBetaMoveAttempt | null;
};

type SwipeStart = { pointerId: number; x: number; y: number };

const Video = styled('video')(({ theme }) => ({
  background: theme.palette.common.black,
  display: 'block',
  maxHeight: 520,
  width: '100%',
}));

function backendUrl(path: string): string {
  return `${getBackendHttpUrl() ?? ''}${path}`;
}

async function fetchMoves(beta: AnalyzedBetaVideo): Promise<ClimbingMove[]> {
  if (!beta.movesPath) return [];
  const response = await fetch(backendUrl(beta.movesPath), { cache: 'no-store' });
  if (!response.ok) throw new Error(`Move analysis returned ${String(response.status)}`);
  const payload = (await response.json()) as { moves?: ClimbingMove[] };
  return payload.moves ?? [];
}

function holdLabel(hold: AnalyzedBetaHold): string {
  const keyLabel = hold.key.replace(/^grid:/, '');
  if (keyLabel !== hold.key) return keyLabel;
  let column = Math.max(1, Math.round(hold.col));
  let columnLabel = '';
  while (column > 0) {
    column -= 1;
    columnLabel = String.fromCharCode(65 + (column % 26)) + columnLabel;
    column = Math.floor(column / 26);
  }
  return `${columnLabel}${String(hold.row)}`;
}

function targetLabel(holds: AnalyzedBetaHold[]): string {
  return holds.map(holdLabel).join(' + ');
}

function handLabel(hand: string): string {
  if (hand === 'left_hand' || hand === 'LH') return 'LH';
  if (hand === 'right_hand' || hand === 'RH') return 'RH';
  return hand;
}

function transitionLabel(transition: ClimbingMoveTransition): string {
  return `${handLabel(transition.hand)} ${holdLabel(transition.source)} → ${holdLabel(transition.destination)}`;
}

function attemptTransitionLabel(attempt: AnalyzedBetaMoveAttempt): string {
  return attempt.transitions.map(transitionLabel).join(' + ');
}

export function AnalyzedBetaNavigator({
  betas,
  navigation,
  boardType,
  climbUuid,
  layoutId,
}: {
  betas: AnalyzedBetaVideo[];
  navigation: AnalyzedBetaNavigation;
  boardType: string;
  climbUuid: string;
  layoutId: number;
}) {
  const { t } = useTranslation('climbs');
  const queryClient = useQueryClient();
  const moveSelectLabelId = useId();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const speedRef = useRef(1);
  const movePaneRef = useRef<HTMLDivElement | null>(null);
  const swipeStartRef = useRef<SwipeStart | null>(null);
  const navigableBetas = useMemo(
    () => betas.filter((beta) => beta.isDefinitive && beta.hasMoveAnalysis && beta.movesPath),
    [betas],
  );
  const betaById = useMemo(() => new Map(navigableBetas.map((beta) => [beta.id, beta])), [navigableBetas]);
  const [moveKey, setMoveKey] = useState('all');
  const [videoId, setVideoId] = useState(navigableBetas[0]?.id ?? '');
  const [speed, setSpeed] = useState(1);
  const [segmentEnd, setSegmentEnd] = useState<number | null>(null);

  const { data: attempts = [], isFetching: attemptsFetching } = useQuery({
    queryKey: ['analyzedBetaMoveAttempts', boardType, climbUuid, layoutId, moveKey],
    queryFn: async () => {
      const result = await createGraphQLHttpClient().request<GetAnalyzedBetaMoveAttemptsResponse>(
        GET_ANALYZED_BETA_MOVE_ATTEMPTS,
        { boardType, climbUuid, layoutId, moveKey },
      );
      return result.analyzedBetaMoveAttempts;
    },
    enabled: moveKey !== 'all',
    staleTime: 5 * 60_000,
  });

  const navigationItems = useMemo<NavigationItem[]>(() => {
    if (moveKey === 'all') return navigableBetas.map((beta) => ({ beta, attempt: null }));
    return attempts.flatMap((attempt) => {
      const beta = betaById.get(attempt.videoId);
      return beta ? [{ beta, attempt }] : [];
    });
  }, [attempts, betaById, moveKey, navigableBetas]);

  useEffect(() => {
    if (attemptsFetching || navigationItems.length === 0) return;
    setVideoId((currentVideoId) =>
      navigationItems.some((item) => item.beta.id === currentVideoId)
        ? currentVideoId
        : (navigationItems[0]?.beta.id ?? ''),
    );
  }, [attemptsFetching, navigationItems]);

  useEffect(() => {
    if (videoId && betaById.has(videoId)) return;
    setVideoId(navigableBetas[0]?.id ?? '');
  }, [betaById, navigableBetas, videoId]);

  const currentIndex = navigationItems.findIndex((item) => item.beta.id === videoId);
  const currentItem = currentIndex >= 0 ? navigationItems[currentIndex] : null;
  const currentBeta = currentItem?.beta ?? betaById.get(videoId) ?? null;
  const currentAttempt = currentItem?.attempt ?? null;

  const { data: localMoves = [], isLoading: movesLoading } = useQuery({
    queryKey: ['analyzedBetaMoves', currentBeta?.id, currentBeta?.movesPath],
    queryFn: () => (currentBeta ? fetchMoves(currentBeta) : Promise.resolve([])),
    enabled: !!currentBeta?.movesPath,
    staleTime: 5 * 60_000,
  });

  const activeLocalMove =
    localMoves.find((move) => move.id === currentAttempt?.localMoveId) ??
    localMoves.find((move) => move.move_key === moveKey) ??
    null;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentAttempt) {
      setSegmentEnd(null);
      return;
    }
    let cancelled = false;
    const playSegment = () => {
      if (cancelled) return;
      video.muted = true;
      video.playbackRate = speedRef.current;
      video.currentTime = currentAttempt.playbackStartS;
      setSegmentEnd(currentAttempt.playbackEndS);
      void video.play().catch(() => undefined);
    };
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) playSegment();
    else video.addEventListener('loadedmetadata', playSegment, { once: true });
    return () => {
      cancelled = true;
      video.removeEventListener('loadedmetadata', playSegment);
      video.pause();
    };
  }, [currentAttempt, currentBeta?.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = speed;
  }, [speed]);

  const updateSpeed = (nextSpeed: number) => {
    speedRef.current = nextSpeed;
    setSpeed(nextSpeed);
    if (videoRef.current) videoRef.current.playbackRate = nextSpeed;
  };

  useEffect(() => {
    if (!currentBeta || currentIndex < 0) return;
    const adjacentBetas = [navigationItems[currentIndex - 1]?.beta, navigationItems[currentIndex + 1]?.beta].filter(
      (beta): beta is AnalyzedBetaVideo => !!beta,
    );
    const preloaders = adjacentBetas.map((beta) => {
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'metadata';
      video.src = backendUrl(beta.playbackPath);
      void queryClient.prefetchQuery({
        queryKey: ['analyzedBetaMoves', beta.id, beta.movesPath],
        queryFn: () => fetchMoves(beta),
        staleTime: 5 * 60_000,
      });
      return video;
    });
    return () => {
      for (const video of preloaders) {
        video.removeAttribute('src');
        video.load();
      }
    };
  }, [currentBeta, currentIndex, navigationItems, queryClient]);

  useEffect(() => {
    const pane = movePaneRef.current;
    const active = pane?.querySelector<HTMLElement>('[data-active="true"]');
    if (!pane || !active) return;
    const top = active.offsetTop;
    const bottom = top + active.offsetHeight;
    if (top < pane.scrollTop) pane.scrollTop = top;
    else if (bottom > pane.scrollTop + pane.clientHeight) pane.scrollTop = bottom - pane.clientHeight;
  }, [activeLocalMove?.id]);

  const selectMove = (nextMoveKey: string) => {
    if (attemptsFetching || nextMoveKey === moveKey) return;
    setSegmentEnd(null);
    setMoveKey(nextMoveKey);
  };

  const navigateAttempt = (offset: number) => {
    const nextItem = navigationItems[currentIndex + offset];
    if (!nextItem) return;
    setSegmentEnd(null);
    setVideoId(nextItem.beta.id);
  };

  const navigateMove = (offset: number) => {
    if (attemptsFetching || localMoves.length === 0) return;
    let moveIndex = activeLocalMove ? localMoves.findIndex((move) => move.id === activeLocalMove.id) : -1;
    if (moveIndex < 0) {
      selectMove(offset > 0 ? (localMoves[0]?.move_key ?? 'all') : (localMoves.at(-1)?.move_key ?? 'all'));
      return;
    }
    for (moveIndex += offset; moveIndex >= 0 && moveIndex < localMoves.length; moveIndex += offset) {
      const nextMove = localMoves[moveIndex];
      if (nextMove && nextMove.move_key !== activeLocalMove?.move_key) {
        selectMove(nextMove.move_key);
        return;
      }
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.matches('input, textarea, [role="combobox"], [role="listbox"]') || target.closest('[role="listbox"]'))
    ) {
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      navigateAttempt(event.key === 'ArrowLeft' ? -1 : 1);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      navigateMove(event.key === 'ArrowUp' ? -1 : 1);
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    swipeStartRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: PointerEvent<HTMLElement>) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || start.pointerId !== event.pointerId) return;
    const horizontalDistance = event.clientX - start.x;
    const verticalDistance = event.clientY - start.y;
    if (Math.abs(horizontalDistance) < 60 || Math.abs(horizontalDistance) <= Math.abs(verticalDistance) * 1.25) return;
    navigateAttempt(horizontalDistance < 0 ? 1 : -1);
  };

  if (!currentBeta && !attemptsFetching) return null;

  const attemptCount = navigationItems.length;
  const attemptPosition = currentIndex >= 0 ? currentIndex + 1 : 0;

  return (
    <Box onKeyDown={handleKeyDown} tabIndex={-1}>
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} spacing={1} sx={{ mb: 1 }}>
        <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 240 } }}>
          <InputLabel id={moveSelectLabelId}>{t('analyzedBeta.moveLabel')}</InputLabel>
          <Select
            labelId={moveSelectLabelId}
            value={moveKey}
            label={t('analyzedBeta.moveLabel')}
            disabled={attemptsFetching}
            onChange={(event) => selectMove(event.target.value)}
          >
            <MenuItem value="all">
              {t('analyzedBeta.allMovesCount', { count: navigation.confirmedVideoCount })}
            </MenuItem>
            {navigation.moves.map((move) => (
              <MenuItem key={move.moveKey} value={move.moveKey}>
                {t('analyzedBeta.moveCoverage', {
                  target: targetLabel(move.targetHolds),
                  videos: move.videoCount,
                  total: move.confirmedVideoCount,
                })}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <VideoSpeedControl value={speed} onChange={updateSpeed} />
        <Box sx={{ flex: 1 }} />
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <IconButton
            onClick={() => navigateAttempt(-1)}
            disabled={attemptsFetching || currentIndex <= 0}
            aria-label={t('analyzedBeta.previousAttemptAria')}
          >
            <NavigateBefore />
          </IconButton>
          <Typography variant="body2" sx={{ minWidth: 96, textAlign: 'center', whiteSpace: 'nowrap' }}>
            {t(moveKey === 'all' ? 'analyzedBeta.videoPosition' : 'analyzedBeta.attemptPosition', {
              current: attemptPosition,
              count: attemptCount,
            })}
          </Typography>
          <IconButton
            onClick={() => navigateAttempt(1)}
            disabled={attemptsFetching || currentIndex < 0 || currentIndex >= attemptCount - 1}
            aria-label={t('analyzedBeta.nextAttemptAria')}
          >
            <NavigateNext />
          </IconButton>
        </Stack>
      </Stack>

      {currentAttempt && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ sm: 1 }} sx={{ mb: 1 }}>
          <Typography variant="body2" fontWeight={700}>
            {attemptTransitionLabel(currentAttempt)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('analyzedBeta.moveConfidence', {
              move: currentAttempt.localOrdinal,
              confidence: Math.round(currentAttempt.confidence * 100),
            })}
            {currentAttempt.warnings.length > 0 ? ` · ${currentAttempt.warnings.join(' · ').replaceAll('_', ' ')}` : ''}
          </Typography>
        </Stack>
      )}

      <Box
        sx={{ display: { xs: 'block', md: 'grid' }, gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 1 }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          swipeStartRef.current = null;
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ bgcolor: 'common.black', position: 'relative' }}>
            {currentBeta && (
              <Video
                key={currentBeta.id}
                ref={videoRef}
                src={backendUrl(currentBeta.playbackPath)}
                controls
                muted
                playsInline
                preload="metadata"
                aria-label={t('analyzedBeta.videoAria')}
                onTimeUpdate={() => {
                  const video = videoRef.current;
                  if (video && segmentEnd != null && video.currentTime >= segmentEnd) {
                    video.pause();
                    video.currentTime = segmentEnd;
                    setSegmentEnd(null);
                  }
                }}
              />
            )}
            <IconButton
              onClick={() => navigateAttempt(-1)}
              disabled={attemptsFetching || currentIndex <= 0}
              aria-label={t('analyzedBeta.previousAttemptAria')}
              sx={{
                bgcolor: 'action.active',
                color: 'common.white',
                left: 8,
                position: 'absolute',
                top: '50%',
                transform: 'translateY(-50%)',
                '&:hover': { bgcolor: 'action.focus' },
              }}
            >
              <NavigateBefore />
            </IconButton>
            <IconButton
              onClick={() => navigateAttempt(1)}
              disabled={attemptsFetching || currentIndex < 0 || currentIndex >= attemptCount - 1}
              aria-label={t('analyzedBeta.nextAttemptAria')}
              sx={{
                bgcolor: 'action.active',
                color: 'common.white',
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                '&:hover': { bgcolor: 'action.focus' },
              }}
            >
              <NavigateNext />
            </IconButton>
          </Box>
          {currentBeta && (
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mt: 1 }}>
              <Typography variant="body2">
                {currentBeta.sourceAccount ? `@${currentBeta.sourceAccount}` : t('analyzedBeta.sourceUnknown')}
              </Typography>
              {currentBeta.postUrl && (
                <Link
                  href={currentBeta.postUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t('analyzedBeta.openPostAria')}
                >
                  <OpenInNew />
                </Link>
              )}
            </Stack>
          )}
        </Box>

        <Paper
          ref={movePaneRef}
          variant="outlined"
          sx={{ maxHeight: 520, minHeight: 180, mt: { xs: 1, md: 0 }, overflowY: 'auto' }}
          aria-label={t('analyzedBeta.movePaneAria')}
        >
          <Box
            sx={{
              alignItems: 'center',
              bgcolor: 'background.paper',
              borderBottom: 1,
              borderColor: 'divider',
              display: 'flex',
              justifyContent: 'space-between',
              px: 1.5,
              py: 1,
              position: 'sticky',
              top: 0,
              zIndex: 1,
            }}
          >
            <Typography variant="subtitle2">{t('analyzedBeta.movesTitle')}</Typography>
            <Typography variant="caption" color="text.secondary">
              {String(localMoves.length)}
            </Typography>
          </Box>
          {movesLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
              <CircularProgress size={22} aria-label={t('analyzedBeta.loadingMoves')} />
            </Box>
          ) : (
            localMoves.map((move) => {
              const active = move.id === activeLocalMove?.id || (moveKey !== 'all' && move.move_key === moveKey);
              return (
                <ButtonBase
                  key={move.id}
                  data-active={active}
                  onClick={() => selectMove(move.move_key)}
                  sx={{
                    alignItems: 'stretch',
                    bgcolor: active ? 'action.selected' : 'background.paper',
                    borderBottom: 1,
                    borderColor: 'divider',
                    display: 'flex',
                    flexDirection: 'column',
                    px: 1.5,
                    py: 1,
                    textAlign: 'left',
                    width: '100%',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" spacing={1} sx={{ width: '100%' }}>
                    <Typography variant="body2" fontWeight={700}>
                      {t('analyzedBeta.moveNumber', { move: move.number })}
                    </Typography>
                    <Typography variant="body2" color="primary.main" fontWeight={700}>
                      {targetLabel(move.transitions.map((transition) => transition.destination))}
                    </Typography>
                  </Stack>
                  {move.transitions.map((transition) => (
                    <Typography key={`${move.id}:${transition.hand}`} variant="caption" color="text.secondary">
                      {transitionLabel(transition)}
                    </Typography>
                  ))}
                </ButtonBase>
              );
            })
          )}
        </Paper>
      </Box>
    </Box>
  );
}
