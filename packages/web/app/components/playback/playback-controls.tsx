'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, IconButton, Slider, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useTranslation } from 'react-i18next';

type PlaybackControlsProps = {
  frameIndex: number;
  frameCount: number;
  isPlaying: boolean;
  speed: number;
  /** Native per-frame pace in ms (already speed-adjusted upstream is OK; this
   * component re-applies `speed` for the slider crawl so the thumb tracks
   * the actual interval the engine uses). */
  paceMs: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (index: number) => void;
  onSpeedChange: (speed: number) => void;
};

/**
 * Compact strip that drives `usePlaybackEngine`. Renders only when the
 * climb has more than one frame; the parent decides whether to mount it.
 */
export function PlaybackControls({
  frameIndex,
  frameCount,
  isPlaying,
  speed,
  paceMs,
  onPlay,
  onPause,
  onSeek,
  onSpeedChange,
}: PlaybackControlsProps) {
  const { t } = useTranslation('common');

  // Crawl the slider thumb smoothly toward the next frame instead of
  // jumping when the engine ticks. `smoothValue` is `frameIndex + progress`
  // where progress ranges 0..1 across the current frame's duration; we
  // drive it with rAF so the animation is local to this component and
  // doesn't trigger engine re-renders.
  const [smoothValue, setSmoothValue] = useState<number>(frameIndex);
  // While the user is dragging the slider, override the rAF-driven crawl
  // with the local drag position. `null` outside drags. Splitting the
  // visual update from the engine seek keeps `onChange` fully local
  // (60 events/sec from per-pixel drag) and only fires the broadcast
  // on `onChangeCommitted` — without this, a single 2-second drag
  // exhausts the queue mutation rate-limit bucket (default 60/min).
  const [scrubValue, setScrubValue] = useState<number | null>(null);
  const lastFrameRef = useRef(frameIndex);
  useEffect(() => {
    lastFrameRef.current = frameIndex;
    if (!isPlaying) {
      setSmoothValue(frameIndex);
      return;
    }
    if (frameCount <= 1 || paceMs <= 0) {
      setSmoothValue(frameIndex);
      return;
    }
    const startedAt = performance.now();
    const effectivePace = paceMs / Math.max(speed, 0.01);
    let rafId = 0;
    const step = (now: number) => {
      const elapsed = now - startedAt;
      const progress = Math.min(1, elapsed / effectivePace);
      setSmoothValue(frameIndex + progress);
      if (progress < 1 && lastFrameRef.current === frameIndex) {
        rafId = requestAnimationFrame(step);
      }
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [frameIndex, frameCount, isPlaying, paceMs, speed]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;
      if (event.code === 'Space') {
        event.preventDefault();
        (isPlaying ? onPause : onPlay)();
      } else if (event.code === 'ArrowRight') {
        event.preventDefault();
        onSeek((frameIndex + 1) % frameCount);
      } else if (event.code === 'ArrowLeft') {
        event.preventDefault();
        onSeek((frameIndex - 1 + frameCount) % frameCount);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [frameIndex, frameCount, isPlaying, onPlay, onPause, onSeek]);

  return (
    <Box
      role="group"
      aria-label={t('playback.seek')}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 2,
        py: 1,
        borderRadius: 2,
        bgcolor: 'background.paper',
        borderTop: 1,
        borderColor: 'divider',
        width: '100%',
        // Parent `.contentWrapper` has overflow:hidden and the carousel is
        // flex:1 — without an explicit shrink:0 the carousel pushes us
        // below the visible bottom edge and the controls vanish.
        flexShrink: 0,
        position: 'relative',
        zIndex: 1,
      }}
    >
      <IconButton
        onClick={isPlaying ? onPause : onPlay}
        aria-label={isPlaying ? t('playback.pause') : t('playback.play')}
        size="small"
      >
        {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
      </IconButton>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ flex: 1, minWidth: 0 }}>
        <Slider
          value={scrubValue ?? smoothValue}
          min={0}
          max={Math.max(0, frameCount - 1)}
          // MUI Slider snapping: `step={null}` requires `marks` to define
          // the valid stops. For short routes we render an integer mark per
          // frame so the thumb snaps cleanly to each frame. For long routes
          // (Driftwood is 43 frames; rendering 43 mark dots looks like a
          // dashed line and there's no room for them visually) we drop the
          // marks — but then `step={null} + marks={false}` leaves the
          // slider with no valid stops at all and it stops responding to
          // input. Branch on count: step={1} when marks are off so the
          // thumb still snaps to integer positions.
          step={frameCount <= 16 ? null : 1}
          marks={frameCount <= 16 ? Array.from({ length: frameCount }, (_, index) => ({ value: index })) : false}
          aria-label={t('playback.seek')}
          onChange={(_, value) => {
            // Drag feedback only: do NOT call onSeek here. MUI fires
            // onChange per pointer-pixel (~60 events/sec); calling onSeek
            // would broadcast a publishPlaybackState mutation for each one
            // and exhaust the per-minute rate-limit bucket within a
            // single 2-second drag.
            if (typeof value === 'number') setScrubValue(value);
          }}
          onChangeCommitted={(_, value) => {
            // Commit on release / keyboard step — this is what actually
            // moves the engine and broadcasts to peers.
            if (typeof value === 'number') onSeek(Math.round(value));
            setScrubValue(null);
          }}
          size="small"
          sx={{
            flex: 1,
            // Marks render at integer frame positions; without explicit
            // mark styling MUI hides them when step={null}. Force them on
            // so the user can still see frame boundaries while scrubbing.
            '& .MuiSlider-mark': { opacity: 0.5, height: 6, width: 2, borderRadius: 1 },
            '& .MuiSlider-markActive': { opacity: 1 },
          }}
        />
        <Typography variant="caption" sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>
          {t('playback.frameOfTotal', {
            index: (scrubValue !== null ? Math.round(scrubValue) : frameIndex) + 1,
            total: frameCount,
          })}
        </Typography>
      </Stack>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={speed}
        onChange={(_, value) => {
          if (typeof value === 'number') onSpeedChange(value);
        }}
        aria-label={t('playback.speed')}
      >
        {/* Static `t(...)` calls so the i18n key linter can resolve each one. */}
        <ToggleButton value={0.5} aria-label={t('playback.speedHalf')}>
          {t('playback.speedHalf')}
        </ToggleButton>
        <ToggleButton value={1} aria-label={t('playback.speedNormal')}>
          {t('playback.speedNormal')}
        </ToggleButton>
        <ToggleButton value={2} aria-label={t('playback.speedDouble')}>
          {t('playback.speedDouble')}
        </ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
}
