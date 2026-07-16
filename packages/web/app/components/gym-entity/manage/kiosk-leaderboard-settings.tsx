'use client';

// Leaderboard rail settings for the kiosk editor: on/off switch (turning it
// ON requires at least one assigned board — the schema tolerates a rail with
// zero boards, the editor doesn't build one; turning it OFF always works),
// scope (all kiosk boards or one assigned board), and the ranking window.
// 'day' copy is ALWAYS "Last 24 hours" — it's a rolling window, never
// calendar-today.

import React from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Tooltip from '@mui/material/Tooltip';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CodeOutlined from '@mui/icons-material/CodeOutlined';
import { KIOSK_LEADERBOARD_PERIODS, type KioskLeaderboardPeriod } from '@boardsesh/kiosk';
import type { UserBoard } from '@boardsesh/shared-schema';
import type { KioskEditorLeaderboard } from './kiosk-editor-state';

/** Sentinel for the "all kiosk boards" Select option (MUI needs a non-null value). */
const ALL_BOARDS_VALUE = '__all__';

type KioskLeaderboardSettingsProps = {
  leaderboard: KioskEditorLeaderboard | null;
  /** The assigned boards resolved to gym boards, in slot order. */
  assignedBoards: UserBoard[];
  /** Inline error on the scope (from schema refine mapping), if any. */
  scopeError: string | null;
  onToggle: (enabled: boolean) => void;
  onScopeChange: (boardUuid: string | null) => void;
  onPeriodChange: (period: KioskLeaderboardPeriod) => void;
  /** Open the leaderboard embed-code dialog. */
  onEmbedLeaderboard: () => void;
  /** The gym leaderboard embed only exists for public gyms. */
  isGymPublic: boolean;
};

export default function KioskLeaderboardSettings({
  leaderboard,
  assignedBoards,
  scopeError,
  onToggle,
  onScopeChange,
  onPeriodChange,
  onEmbedLeaderboard,
  isGymPublic,
}: KioskLeaderboardSettingsProps) {
  const { t } = useTranslation('kiosk');
  const hasBoards = assignedBoards.length > 0;
  const railEnabled = leaderboard !== null;

  // A scope pointing at a board that's no longer at the gym isn't in the
  // MenuItems — clamp the DISPLAYED value to "all boards" instead of handing
  // MUI an out-of-range value (blank Select + console warning). The stored
  // scope is untouched; removing the dead slot widens it for real.
  const scopedBoardUuid = leaderboard?.boardUuid ?? null;
  const scopeSelectValue =
    scopedBoardUuid !== null && assignedBoards.some((board) => board.uuid === scopedBoardUuid)
      ? scopedBoardUuid
      : ALL_BOARDS_VALUE;

  const periodLabels: Record<KioskLeaderboardPeriod, string> = {
    session: t('manage.editor.period.session'),
    day: t('manage.editor.period.day'),
    week: t('manage.editor.period.week'),
    month: t('manage.editor.period.month'),
  };

  // Zero boards only blocks turning the rail ON. A persisted rail-on kiosk
  // whose boards have all been unlinked must still be switchable OFF — a
  // checked-and-disabled switch would be a dead end.
  const switchDisabled = !hasBoards && !railEnabled;

  const switchControl = (
    <FormControlLabel
      control={
        <Switch checked={railEnabled} disabled={switchDisabled} onChange={(event) => onToggle(event.target.checked)} />
      }
      label={t('manage.editor.railSwitch')}
    />
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
        {switchDisabled ? (
          <Tooltip title={t('manage.editor.railDisabledTooltip')}>
            <span>{switchControl}</span>
          </Tooltip>
        ) : (
          switchControl
        )}
        <Tooltip title={isGymPublic ? t('embed.railButton') : t('embed.publicOnlyGym')}>
          <span>
            <Button
              size="small"
              variant="text"
              startIcon={<CodeOutlined />}
              onClick={onEmbedLeaderboard}
              disabled={!isGymPublic}
              sx={{ textTransform: 'none' }}
            >
              {t('embed.railButton')}
            </Button>
          </span>
        </Tooltip>
      </Box>

      {railEnabled && (
        <>
          <FormControl size="small" error={scopeError !== null} sx={{ maxWidth: 360 }}>
            <InputLabel id="kiosk-leaderboard-scope-label">{t('manage.editor.scopeLabel')}</InputLabel>
            <Select
              labelId="kiosk-leaderboard-scope-label"
              label={t('manage.editor.scopeLabel')}
              value={scopeSelectValue}
              onChange={(event) => {
                const selectedValue = event.target.value;
                onScopeChange(selectedValue === ALL_BOARDS_VALUE ? null : selectedValue);
              }}
            >
              <MenuItem value={ALL_BOARDS_VALUE}>{t('manage.editor.scopeAll')}</MenuItem>
              {assignedBoards.map((board) => (
                <MenuItem key={board.uuid} value={board.uuid}>
                  {board.name}
                </MenuItem>
              ))}
            </Select>
            {scopeError !== null && <FormHelperText>{scopeError}</FormHelperText>}
          </FormControl>

          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
              {t('manage.editor.periodLabel')}
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={leaderboard.period}
              onChange={(_event, nextPeriod: KioskLeaderboardPeriod | null) => {
                if (nextPeriod !== null) onPeriodChange(nextPeriod);
              }}
            >
              {KIOSK_LEADERBOARD_PERIODS.map((period) => (
                <ToggleButton key={period} value={period} sx={{ textTransform: 'none' }}>
                  {periodLabels[period]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
        </>
      )}
    </Box>
  );
}
