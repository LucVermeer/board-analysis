'use client';

// Board slot rows for the kiosk editor: up to MAX_KIOSK_BOARDS rows, each an
// Autocomplete over the gym's boards (boards already used in another slot are
// excluded), with up/down reorder (slot order = on-screen order), remove, and
// a per-board Embed action. A trailing Autocomplete adds the next slot.

import React from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import ArrowUpwardOutlined from '@mui/icons-material/ArrowUpwardOutlined';
import ArrowDownwardOutlined from '@mui/icons-material/ArrowDownwardOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import CodeOutlined from '@mui/icons-material/CodeOutlined';
import { MAX_KIOSK_BOARDS } from '@boardsesh/kiosk';
import type { UserBoard } from '@boardsesh/shared-schema';
import { boardTypeLabel } from '@boardsesh/board-constants';
import { VisibilityChip } from './gym-boards-tab';

function boardOptionLabel(board: UserBoard): string {
  return `${board.name} · ${boardTypeLabel(board.boardType)}`;
}

function BoardOption({ board }: { board: UserBoard }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, width: '100%' }}>
      <Typography component="span" noWrap sx={{ flex: 1, minWidth: 0 }}>
        {boardOptionLabel(board)}
      </Typography>
      <VisibilityChip board={board} />
    </Box>
  );
}

type KioskBoardSlotsProps = {
  /** Assigned board uuids in slot order. */
  slotBoardUuids: string[];
  /** All the gym's boards (editors see private/unlisted ones too). */
  gymBoards: UserBoard[];
  /** Inline error per slot index (from schema refine mapping), if any. */
  slotErrors: ReadonlyMap<number, string>;
  onSetSlot: (index: number, boardUuid: string) => void;
  onMoveSlot: (index: number, direction: -1 | 1) => void;
  onRemoveSlot: (index: number) => void;
  onAddBoard: (boardUuid: string) => void;
  /** Open the embed-code dialog for one assigned board. */
  onEmbedBoard: (board: UserBoard) => void;
};

export default function KioskBoardSlots({
  slotBoardUuids,
  gymBoards,
  slotErrors,
  onSetSlot,
  onMoveSlot,
  onRemoveSlot,
  onAddBoard,
  onEmbedBoard,
}: KioskBoardSlotsProps) {
  const { t } = useTranslation('kiosk');

  const boardsByUuid = new Map(gymBoards.map((board) => [board.uuid, board]));
  const assignedUuids = new Set(slotBoardUuids);
  const availableBoards = gymBoards.filter((board) => !assignedUuids.has(board.uuid));
  const isFull = slotBoardUuids.length >= MAX_KIOSK_BOARDS;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {slotBoardUuids.map((boardUuid, index) => {
        const board = boardsByUuid.get(boardUuid) ?? null;
        const slotError = slotErrors.get(index) ?? null;
        // The row's Autocomplete offers the unassigned boards plus its own
        // current value (so the selected label renders).
        const rowOptions = board ? [board, ...availableBoards] : availableBoards;

        return (
          <Box key={boardUuid} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
            <Autocomplete
              options={rowOptions}
              value={board}
              onChange={(_event, nextBoard) => {
                if (nextBoard) onSetSlot(index, nextBoard.uuid);
              }}
              getOptionLabel={boardOptionLabel}
              isOptionEqualToValue={(option, selected) => option.uuid === selected.uuid}
              renderOption={(props, option) => (
                <li {...props} key={option.uuid}>
                  <BoardOption board={option} />
                </li>
              )}
              disableClearable={board !== null}
              size="small"
              fullWidth
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={t('manage.editor.slotLabel', { index: index + 1 })}
                  error={slotError !== null || board === null}
                  helperText={slotError ?? (board === null ? t('manage.editor.slotUnknownBoard') : undefined)}
                />
              )}
              sx={{ flex: 1, minWidth: 0 }}
            />

            <Tooltip title={t('manage.editor.moveUp')}>
              <span>
                <IconButton
                  size="small"
                  aria-label={t('manage.editor.moveUp')}
                  disabled={index === 0}
                  onClick={() => onMoveSlot(index, -1)}
                >
                  <ArrowUpwardOutlined fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={t('manage.editor.moveDown')}>
              <span>
                <IconButton
                  size="small"
                  aria-label={t('manage.editor.moveDown')}
                  disabled={index === slotBoardUuids.length - 1}
                  onClick={() => onMoveSlot(index, 1)}
                >
                  <ArrowDownwardOutlined fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={board && !board.isPublic ? t('embed.publicOnlyBoard') : t('embed.boardButton')}>
              <span>
                <IconButton
                  size="small"
                  aria-label={t('embed.boardButton')}
                  disabled={board === null || !board.isPublic}
                  onClick={() => {
                    if (board) onEmbedBoard(board);
                  }}
                >
                  <CodeOutlined fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={t('manage.editor.removeSlot')}>
              <span>
                <IconButton size="small" aria-label={t('manage.editor.removeSlot')} onClick={() => onRemoveSlot(index)}>
                  <CloseOutlined fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        );
      })}

      {isFull ? (
        <Box>
          <Button disabled size="small" sx={{ textTransform: 'none', px: 0 }}>
            {t('manage.editor.addBoard')}
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {t('manage.editor.addBoardFullHelper', { max: MAX_KIOSK_BOARDS })}
          </Typography>
        </Box>
      ) : (
        <Autocomplete
          // Remount after each add so the typed text clears with the selection.
          key={slotBoardUuids.length}
          options={availableBoards}
          value={null}
          onChange={(_event, nextBoard) => {
            if (nextBoard) onAddBoard(nextBoard.uuid);
          }}
          getOptionLabel={boardOptionLabel}
          isOptionEqualToValue={(option, selected) => option.uuid === selected.uuid}
          renderOption={(props, option) => (
            <li {...props} key={option.uuid}>
              <BoardOption board={option} />
            </li>
          )}
          // Selecting immediately turns into a slot row; the add field resets.
          blurOnSelect
          size="small"
          fullWidth
          disabled={availableBoards.length === 0}
          renderInput={(params) => (
            <TextField
              {...params}
              label={t('manage.editor.addBoard')}
              helperText={
                availableBoards.length === 0 ? t('manage.editor.addBoardNoneLeft') : t('manage.editor.addBoardHelper')
              }
            />
          )}
        />
      )}
    </Box>
  );
}
