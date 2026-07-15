'use client';

// The opinionated kiosk editor: assign up to four boards (slot order = screen
// order), toggle the leaderboard rail, and watch the REAL kiosk render live in
// the scaled preview. There is no preset picker and no drag-and-drop — the
// preset IS the board count. Saving serialises the local state through the
// strict KioskLayoutSchema (the same gate the backend applies) and persists
// via updateGymKiosk.

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Divider from '@mui/material/Divider';
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined';
import { KioskLayoutSchema } from '@boardsesh/kiosk';
import {
  UPDATE_GYM_KIOSK,
  type UpdateGymKioskMutationResponse,
  type UpdateGymKioskMutationVariables,
} from '@boardsesh/graphql/operations';
import type { Gym, GymKiosk, UserBoard } from '@boardsesh/shared-schema';
import { useEntityMutation } from '@/app/hooks/use-entity-mutation';
import { themeTokens } from '@/app/theme/theme-config';
import {
  addBoardSlot,
  editorStateFromLayout,
  editorStatesEqual,
  moveBoardSlot,
  removeBoardSlot,
  serializeKioskLayout,
  setLeaderboardEnabled,
  setLeaderboardPeriod,
  setLeaderboardScope,
  setSlotBoard,
  type KioskEditorState,
} from './kiosk-editor-state';
import { buildBoardEmbedSnippet, buildLeaderboardEmbedSnippet } from './embed-snippets';
import KioskBoardSlots from './kiosk-board-slots';
import KioskLayoutBadge from './kiosk-layout-badge';
import KioskLeaderboardSettings from './kiosk-leaderboard-settings';
import KioskPreview from './kiosk-preview';
import EmbedCodeDialog, { type EmbedCodeDialogState } from './embed-code-dialog';

type KioskEditorProps = {
  gym: Gym;
  kiosk: GymKiosk;
  /** All the gym's boards (null while loading). */
  gymBoards: UserBoard[] | null;
  onBack: () => void;
  /** Called with the updated kiosk after a successful save. */
  onSaved: (kiosk: GymKiosk) => void;
};

export default function KioskEditor({ gym, kiosk, gymBoards, onBack, onSaved }: KioskEditorProps) {
  const { t } = useTranslation('kiosk');
  const [editorState, setEditorState] = useState<KioskEditorState>(() => editorStateFromLayout(kiosk.layout));
  const [baselineState, setBaselineState] = useState<KioskEditorState>(editorState);
  const [slotErrors, setSlotErrors] = useState<ReadonlyMap<number, string>>(new Map());
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [embedDialog, setEmbedDialog] = useState<EmbedCodeDialogState | null>(null);

  const isDirty = !editorStatesEqual(editorState, baselineState);

  // Native confirm on page close/refresh while unsaved. In-app tab switches in
  // the manage shell unmount this editor without a hook to intercept; the
  // explicit Back button below is the guarded path.
  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const updateKioskMutation = useEntityMutation<UpdateGymKioskMutationResponse, UpdateGymKioskMutationVariables>(
    UPDATE_GYM_KIOSK,
    { successMessage: t('manage.editor.saved'), errorMessage: t('manage.editor.saveFailed') },
  );

  const applyStateChange = (nextState: KioskEditorState) => {
    setEditorState(nextState);
    // Any edit invalidates previous inline validation errors.
    setSlotErrors(new Map());
    setScopeError(null);
  };

  const assignedBoards =
    gymBoards === null
      ? []
      : editorState.boardUuids
          .map((boardUuid) => gymBoards.find((board) => board.uuid === boardUuid))
          .filter((board): board is UserBoard => board !== undefined);

  // Slots whose board isn't (or no longer is) one of the gym's boards can't
  // save — the backend rejects layouts naming boards not linked to the gym.
  const hasUnknownSlots = gymBoards !== null && assignedBoards.length !== editorState.boardUuids.length;

  const handleSave = async () => {
    const parsed = KioskLayoutSchema.safeParse(serializeKioskLayout(editorState));
    if (!parsed.success) {
      // The editor's invariants make these unreachable in normal use; map them
      // to inline errors anyway so a slipped state is explained, not swallowed.
      const nextSlotErrors = new Map<number, string>();
      let nextScopeError: string | null = null;
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'boards' && typeof issue.path[1] === 'number') {
          nextSlotErrors.set(issue.path[1], t('manage.editor.slotDuplicateError'));
        } else if (issue.path[0] === 'leaderboard') {
          nextScopeError = t('manage.editor.scopeInvalidError');
        }
      }
      setSlotErrors(nextSlotErrors);
      setScopeError(nextScopeError);
      return;
    }

    setIsSaving(true);
    try {
      const data = await updateKioskMutation.execute({
        input: { kioskUuid: kiosk.uuid, layout: parsed.data },
      });
      if (data) {
        setBaselineState(editorState);
        onSaved(data.updateGymKiosk);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    if (isDirty) {
      setDiscardDialogOpen(true);
    } else {
      onBack();
    }
  };

  const kioskUrlPath = gym.slug ? `/kiosk/${gym.slug}/${kiosk.slug}` : null;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <Button
          startIcon={<ArrowBackOutlined />}
          onClick={handleBack}
          size="small"
          sx={{ textTransform: 'none', flexShrink: 0 }}
        >
          {t('manage.editor.back')}
        </Button>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography variant="h6" sx={{ fontWeight: themeTokens.typography.fontWeight.bold, lineHeight: 1.2 }}>
            {kiosk.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {kioskUrlPath ?? t('manage.editor.needSlug')}
          </Typography>
        </Box>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!isDirty || isSaving || gymBoards === null || hasUnknownSlots}
          sx={{ textTransform: 'none', flexShrink: 0 }}
        >
          {isSaving ? <CircularProgress size={20} color="inherit" /> : t('manage.editor.save')}
        </Button>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 5fr) minmax(0, 7fr)' },
          gap: 3,
          alignItems: 'start',
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: themeTokens.typography.fontWeight.semibold, mb: 1 }}>
              {t('manage.editor.boardsHeading')}
            </Typography>
            {gymBoards === null ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                <CircularProgress size={24} />
              </Box>
            ) : (
              <KioskBoardSlots
                slotBoardUuids={editorState.boardUuids}
                gymBoards={gymBoards}
                slotErrors={slotErrors}
                onSetSlot={(index, boardUuid) => applyStateChange(setSlotBoard(editorState, index, boardUuid))}
                onMoveSlot={(index, direction) => applyStateChange(moveBoardSlot(editorState, index, direction))}
                onRemoveSlot={(index) => applyStateChange(removeBoardSlot(editorState, index))}
                onAddBoard={(boardUuid) => applyStateChange(addBoardSlot(editorState, boardUuid))}
                onEmbedBoard={(board) =>
                  setEmbedDialog({
                    title: t('embed.boardDialogTitle', { name: board.name }),
                    snippet: buildBoardEmbedSnippet({ boardUuid: board.uuid, boardName: board.name }),
                    showPeriodNote: false,
                  })
                }
              />
            )}
          </Box>

          <KioskLayoutBadge boardCount={editorState.boardUuids.length} hasRail={editorState.leaderboard !== null} />

          <Divider />

          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: themeTokens.typography.fontWeight.semibold, mb: 1 }}>
              {t('manage.editor.leaderboardHeading')}
            </Typography>
            <KioskLeaderboardSettings
              leaderboard={editorState.leaderboard}
              assignedBoards={assignedBoards}
              scopeError={scopeError}
              onToggle={(enabled) => applyStateChange(setLeaderboardEnabled(editorState, enabled))}
              onScopeChange={(boardUuid) => applyStateChange(setLeaderboardScope(editorState, boardUuid))}
              onPeriodChange={(period) => applyStateChange(setLeaderboardPeriod(editorState, period))}
              onEmbedLeaderboard={() =>
                setEmbedDialog({
                  title: t('embed.railDialogTitle', { name: gym.name }),
                  snippet: buildLeaderboardEmbedSnippet({ gymUuid: gym.uuid, gymName: gym.name }),
                  showPeriodNote: true,
                })
              }
              isGymPublic={gym.isPublic}
            />
          </Box>
        </Box>

        <Box sx={{ position: { md: 'sticky' }, top: { md: 'calc(var(--global-header-height) + 16px)' } }}>
          <Typography variant="subtitle1" sx={{ fontWeight: themeTokens.typography.fontWeight.semibold, mb: 1 }}>
            {t('manage.editor.previewHeading')}
          </Typography>
          {gymBoards === null ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <KioskPreview gym={gym} kioskName={kiosk.name} state={editorState} gymBoards={gymBoards} />
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            {t('manage.editor.previewHint')}
          </Typography>
        </Box>
      </Box>

      <Dialog open={discardDialogOpen} onClose={() => setDiscardDialogOpen(false)}>
        <DialogTitle>{t('manage.editor.discardTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('manage.editor.discardBody')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDiscardDialogOpen(false)} sx={{ textTransform: 'none' }} autoFocus>
            {t('manage.editor.keepEditing')}
          </Button>
          <Button
            color="error"
            onClick={() => {
              setDiscardDialogOpen(false);
              onBack();
            }}
            sx={{ textTransform: 'none' }}
          >
            {t('manage.editor.discard')}
          </Button>
        </DialogActions>
      </Dialog>

      <EmbedCodeDialog state={embedDialog} onClose={() => setEmbedDialog(null)} />
    </Box>
  );
}
