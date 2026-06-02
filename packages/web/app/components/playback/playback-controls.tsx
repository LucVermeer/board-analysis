'use client';

import { useEffect, useState } from 'react';
import { Box, IconButton, Popover, Slider, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ReplayIcon from '@mui/icons-material/Replay';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import { useTranslation } from 'react-i18next';

type PlaybackControlsProps = {
  frameIndex: number;
  frameCount: number;
  isPlaying: boolean;
  speed: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (index: number) => void;
  onSpeedChange: (speed: number) => void;
};

/** Speeds with their own toggle button; anything else is a custom slider value. */
const PRESET_SPEEDS = [0.5, 1];
// Lower bound sits just above the 1× preset so the slider can never land on a
// preset value — otherwise dragging to exactly 1.0 would re-activate the 1×
// toggle while the popover is still open, leaving the custom button as "…".
const MIN_CUSTOM_SPEED = 1.1;
const MAX_CUSTOM_SPEED = 10;

/** 1-decimal, trailing `.0` stripped: 7.0 → "7", 6.3 → "6.3". */
function formatSpeed(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * Compact strip that drives `usePlaybackEngine`. Renders only when the
 * climb has more than one frame; the parent decides whether to mount it.
 */
export function PlaybackControls({
  frameIndex,
  frameCount,
  isPlaying,
  speed,
  onPlay,
  onPause,
  onSeek,
  onSpeedChange,
}: PlaybackControlsProps) {
  const { t } = useTranslation('common');

  // Anchor + in-drag value for the custom-speed popover slider. `draftSpeed`
  // keeps the slider crawl fully local: committing on every pointer pixel
  // would broadcast a `publishPlaybackState` mutation per event and exhaust
  // the per-minute rate-limit bucket — so we only call `onSpeedChange` on
  // `onChangeCommitted` (release / keyboard step).
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [draftSpeed, setDraftSpeed] = useState<number>(MIN_CUSTOM_SPEED);

  const isCustomSpeed = !PRESET_SPEEDS.includes(speed);
  // Stopped on the final frame: the primary button becomes a replay control
  // that restarts from frame 0 (the engine's play() handles the reset).
  const isAtEnd = !isPlaying && frameIndex >= frameCount - 1;

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
        onSeek(Math.min(frameCount - 1, frameIndex + 1));
      } else if (event.code === 'ArrowLeft') {
        event.preventDefault();
        onSeek(Math.max(0, frameIndex - 1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [frameIndex, frameCount, isPlaying, onPlay, onPause, onSeek]);

  const openSpeedPopover = (event: React.MouseEvent<HTMLElement>) => {
    const seed = speed >= MIN_CUSTOM_SPEED ? Math.min(MAX_CUSTOM_SPEED, speed) : 2;
    setDraftSpeed(seed);
    setAnchorEl(event.currentTarget);
  };

  return (
    <Box
      role="group"
      aria-label={t('playback.controls')}
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
        aria-label={isPlaying ? t('playback.pause') : isAtEnd ? t('playback.replay') : t('playback.play')}
        size="small"
      >
        {isPlaying ? <PauseIcon /> : isAtEnd ? <ReplayIcon /> : <PlayArrowIcon />}
      </IconButton>
      <Stack direction="row" alignItems="center" spacing={1}>
        <IconButton
          onClick={() => onSeek(frameIndex - 1)}
          disabled={frameIndex === 0}
          aria-label={t('playback.prevFrame')}
          size="small"
        >
          <SkipPreviousIcon />
        </IconButton>
        <Typography variant="caption" sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>
          {t('playback.frameOfTotal', { index: frameIndex + 1, total: frameCount })}
        </Typography>
        <IconButton
          onClick={() => onSeek(frameIndex + 1)}
          disabled={frameIndex >= frameCount - 1}
          aria-label={t('playback.nextFrame')}
          size="small"
        >
          <SkipNextIcon />
        </IconButton>
      </Stack>
      <Box sx={{ flex: 1 }} />
      <ToggleButtonGroup
        size="small"
        exclusive
        value={isCustomSpeed ? 'custom' : speed}
        onChange={(_, value) => {
          // The custom button manages its own popover via onClick; ignore the
          // group's value event for it (and `null` from deselecting).
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
        <ToggleButton value="custom" aria-label={t('playback.speedCustomLabel')} onClick={openSpeedPopover}>
          {isCustomSpeed ? (
            t('playback.speedCustom', { value: formatSpeed(speed) })
          ) : (
            <MoreHorizIcon fontSize="small" />
          )}
        </ToggleButton>
      </ToggleButtonGroup>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Box sx={{ px: 3, pt: 4, pb: 2, width: 220 }}>
          <Slider
            value={draftSpeed}
            min={MIN_CUSTOM_SPEED}
            max={MAX_CUSTOM_SPEED}
            step={0.1}
            aria-label={t('playback.speed')}
            valueLabelDisplay="on"
            valueLabelFormat={(value) => formatSpeed(value)}
            onChange={(_, value) => {
              if (typeof value === 'number') setDraftSpeed(value);
            }}
            onChangeCommitted={(_, value) => {
              if (typeof value === 'number') onSpeedChange(value);
              setAnchorEl(null);
            }}
            size="small"
          />
        </Box>
      </Popover>
    </Box>
  );
}
