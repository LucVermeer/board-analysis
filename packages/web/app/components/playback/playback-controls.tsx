'use client';

import { useEffect } from 'react';
import { Box, IconButton, Slider, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
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
          value={frameIndex}
          min={0}
          max={Math.max(0, frameCount - 1)}
          step={1}
          marks={frameCount <= 16}
          aria-label={t('playback.seek')}
          onChange={(_, value) => {
            if (typeof value === 'number') onSeek(value);
          }}
          size="small"
          sx={{ flex: 1 }}
        />
        <Typography variant="caption" sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>
          {t('playback.frameOfTotal', { index: frameIndex + 1, total: frameCount })}
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
