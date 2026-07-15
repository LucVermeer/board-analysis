'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import AddOutlined from '@mui/icons-material/AddOutlined';
import LinkOffOutlined from '@mui/icons-material/LinkOffOutlined';
import { useWsAuthToken } from '@/app/hooks/use-ws-auth-token';
import { createGraphQLHttpClient } from '@/app/lib/graphql/client';
import { useEntityMutation } from '@/app/hooks/use-entity-mutation';
import {
  GET_GYM_BOARDS,
  GET_MY_BOARDS,
  LINK_BOARD_TO_GYM,
  type GetGymBoardsQueryResponse,
  type GetGymBoardsQueryVariables,
  type GetMyBoardsQueryResponse,
  type LinkBoardToGymMutationResponse,
  type LinkBoardToGymMutationVariables,
} from '@boardsesh/graphql/operations';
import type { UserBoard } from '@boardsesh/shared-schema';
import { themeTokens } from '@/app/theme/theme-config';
import type { GymManageTabProps } from './tab-props';

// Brand display names — proper nouns, not translated copy.
const BOARD_TYPE_LABELS: Record<string, string> = {
  kilter: 'Kilter',
  tension: 'Tension',
  moonboard: 'MoonBoard',
  decoy: 'Decoy',
  touchstone: 'Touchstone',
  grasshopper: 'Grasshopper',
  soill: 'So iLL',
};

function boardTypeLabel(boardType: string): string {
  return BOARD_TYPE_LABELS[boardType] ?? boardType;
}

function VisibilityChip({ board }: { board: Pick<UserBoard, 'isPublic' | 'isUnlisted'> }) {
  const { t } = useTranslation('kiosk');
  if (board.isPublic) {
    return <Chip size="small" color="success" variant="outlined" label={t('manage.boards.visibility.public')} />;
  }
  if (board.isUnlisted) {
    return <Chip size="small" color="warning" variant="outlined" label={t('manage.boards.visibility.unlisted')} />;
  }
  return <Chip size="small" variant="outlined" label={t('manage.boards.visibility.private')} />;
}

export default function GymBoardsTab({ gym }: GymManageTabProps) {
  const { t } = useTranslation('kiosk');
  const { token } = useWsAuthToken();
  const [boards, setBoards] = useState<UserBoard[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<UserBoard | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const linkedBoardUuids = useMemo(() => new Set((boards ?? []).map((board) => board.uuid)), [boards]);

  const linkMutation = useEntityMutation<LinkBoardToGymMutationResponse, LinkBoardToGymMutationVariables>(
    LINK_BOARD_TO_GYM,
    { successMessage: t('manage.boards.linked'), errorMessage: t('manage.boards.linkFailed') },
  );
  const unlinkMutation = useEntityMutation<LinkBoardToGymMutationResponse, LinkBoardToGymMutationVariables>(
    LINK_BOARD_TO_GYM,
    { successMessage: t('manage.boards.unlinked'), errorMessage: t('manage.boards.unlinkFailed') },
  );

  const fetchBoards = useCallback(async () => {
    if (!token) return;
    setLoadError(false);
    try {
      const client = createGraphQLHttpClient(token);
      const data = await client.request<GetGymBoardsQueryResponse, GetGymBoardsQueryVariables>(GET_GYM_BOARDS, {
        gymUuid: gym.uuid,
      });
      setBoards(data.gymBoards ?? []);
    } catch (error) {
      console.error('Failed to load gym boards:', error);
      setLoadError(true);
      setBoards([]);
    }
  }, [token, gym.uuid]);

  useEffect(() => {
    void fetchBoards();
  }, [fetchBoards]);

  const handleUnlinkConfirm = async () => {
    if (!unlinkTarget) return;
    const target = unlinkTarget;
    setUnlinkTarget(null);
    const result = await unlinkMutation.execute({ input: { boardUuid: target.uuid, gymUuid: null } });
    if (result) {
      await fetchBoards();
    }
  };

  const handleLink = async (boardUuid: string) => {
    const result = await linkMutation.execute({ input: { boardUuid, gymUuid: gym.uuid } });
    if (result) {
      await fetchBoards();
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, mb: 1 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: themeTokens.typography.fontWeight.bold }}>
            {t('manage.boards.heading')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('manage.boards.description')}
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddOutlined />}
          onClick={() => setAddDialogOpen(true)}
          sx={{ textTransform: 'none', flexShrink: 0 }}
        >
          {t('manage.boards.addBoard')}
        </Button>
      </Box>

      {boards === null ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : loadError ? (
        <Typography variant="body2" color="error" sx={{ py: 2 }}>
          {t('manage.boards.loadError')}
        </Typography>
      ) : boards.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
          {t('manage.boards.empty')}
        </Typography>
      ) : (
        <List disablePadding>
          {boards.map((board) => (
            <ListItem
              key={board.uuid}
              divider
              disableGutters
              secondaryAction={
                <Button
                  size="small"
                  color="error"
                  startIcon={<LinkOffOutlined />}
                  onClick={() => setUnlinkTarget(board)}
                  sx={{ textTransform: 'none' }}
                >
                  {t('manage.boards.unlink')}
                </Button>
              }
            >
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography component="span" sx={{ fontWeight: themeTokens.typography.fontWeight.semibold }}>
                      {board.name}
                    </Typography>
                    <VisibilityChip board={board} />
                  </Box>
                }
                secondary={`${boardTypeLabel(board.boardType)} · ${board.angle}°`}
              />
            </ListItem>
          ))}
        </List>
      )}

      <Dialog open={unlinkTarget !== null} onClose={() => setUnlinkTarget(null)}>
        <DialogTitle>{t('manage.boards.unlinkTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('manage.boards.unlinkBody', { name: unlinkTarget?.name ?? '' })}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnlinkTarget(null)} sx={{ textTransform: 'none' }}>
            {t('manage.boards.cancel')}
          </Button>
          <Button onClick={handleUnlinkConfirm} color="error" autoFocus sx={{ textTransform: 'none' }}>
            {t('manage.boards.unlinkConfirm')}
          </Button>
        </DialogActions>
      </Dialog>

      <AddBoardDialog
        open={addDialogOpen}
        gymUuid={gym.uuid}
        linkedBoardUuids={new Set((boards ?? []).map((board) => board.uuid))}
        onClose={() => setAddDialogOpen(false)}
        onLink={handleLink}
      />
    </Box>
  );
}

type AddBoardDialogProps = {
  open: boolean;
  gymUuid: string;
  linkedBoardUuids: Set<string>;
  onClose: () => void;
  onLink: (boardUuid: string) => Promise<void>;
};

function AddBoardDialog({ open, gymUuid, linkedBoardUuids, onClose, onLink }: AddBoardDialogProps) {
  const { t } = useTranslation('kiosk');
  const { token } = useWsAuthToken();
  const [candidates, setCandidates] = useState<UserBoard[] | null>(null);
  const [linkingUuid, setLinkingUuid] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;
    setCandidates(null);
    (async () => {
      try {
        const client = createGraphQLHttpClient(token);
        const data = await client.request<GetMyBoardsQueryResponse>(GET_MY_BOARDS, {
          input: { limit: 50, offset: 0 },
        });
        if (cancelled) return;
        // Only boards the viewer owns that aren't already on this gym.
        const linkable = data.myBoards.boards.filter(
          (board) => board.isOwned && board.gymUuid !== gymUuid && !linkedBoardUuids.has(board.uuid),
        );
        setCandidates(linkable);
      } catch (error) {
        console.error('Failed to load your boards:', error);
        if (!cancelled) setCandidates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, token, gymUuid, linkedBoardUuids]);

  const handleLinkClick = async (boardUuid: string) => {
    setLinkingUuid(boardUuid);
    try {
      await onLink(boardUuid);
      setCandidates((prev) => (prev === null ? prev : prev.filter((board) => board.uuid !== boardUuid)));
    } finally {
      setLinkingUuid(null);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('manage.boards.addDialog.title')}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 1 }}>{t('manage.boards.addDialog.body')}</DialogContentText>
        {candidates === null ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
            <CircularProgress size={18} />
            <Typography variant="body2" color="text.secondary">
              {t('manage.boards.addDialog.loading')}
            </Typography>
          </Box>
        ) : candidates.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            {t('manage.boards.addDialog.empty')}
          </Typography>
        ) : (
          <List disablePadding>
            {candidates.map((board) => (
              <ListItem
                key={board.uuid}
                disableGutters
                secondaryAction={
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={linkingUuid !== null}
                    onClick={() => handleLinkClick(board.uuid)}
                    sx={{ textTransform: 'none' }}
                  >
                    {linkingUuid === board.uuid ? (
                      <CircularProgress size={16} color="inherit" />
                    ) : (
                      t('manage.boards.addDialog.link')
                    )}
                  </Button>
                }
              >
                <ListItemText primary={board.name} secondary={`${boardTypeLabel(board.boardType)} · ${board.angle}°`} />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>
          {t('manage.boards.addDialog.close')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
